import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import type { CurrentUser } from "@/lib/dal";
import { canManageTeam } from "@/lib/dal";
import { autoSchedule, planNeeds, type AutoPlanResult } from "@/lib/auto-schedule";
import { describePlanTime, formatClock, formatPlanDate, sortPlanTimes, toDateInput, todayInZone } from "@/lib/format";
import { scheduleEmail, scheduleListEmail, sendEmail, type ScheduleEmailKind } from "@/lib/email";

// ----- Links in schedule emails -----
//
// A link carries the assignment's id and a signature of it, so it works
// without signing in, can't be guessed, and stays valid when a reminder is
// sent later. It only ever lets someone answer that one request. An email covering
// several services links to a list instead, signed for the person: it shows their
// upcoming services and lets them answer those, and nothing else.

function signature(subject: string) {
  return createHmac("sha256", process.env.SESSION_SECRET as string)
    .update(subject)
    .digest("base64url")
    .slice(0, 32);
}

function matches(token: string, subject: string) {
  const expected = Buffer.from(signature(subject));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function verifyResponseLink(assignmentId: string, token: string) {
  return matches(token, `respond:${assignmentId}`);
}

export function responseUrl(assignmentId: string, answer: "confirm" | "decline") {
  return `${process.env.APP_URL}/respond/${assignmentId}?t=${signature(`respond:${assignmentId}`)}&answer=${answer}`;
}

export function verifyServiceListLink(personId: string, token: string) {
  return matches(token, `respond-list:${personId}`);
}

export function serviceListUrl(personId: string) {
  return `${process.env.APP_URL}/respond/person/${personId}?t=${signature(`respond-list:${personId}`)}`;
}

// ----- Who can see which plans -----

// Leaders and up see every plan; members only the ones they're scheduled on.
export function visiblePlans(user: CurrentUser) {
  return {
    organizationId: user.organizationId,
    ...(hasRole(user.role, "LEADER") ? {} : { assignments: { some: { personId: user.id } } }),
  };
}

// A "back to the plan" link for a page reached from a plan (the plan's id
// travels in the address as ?plan=). Null if there isn't one or the person
// isn't allowed to see it.
export async function planBackLink(user: CurrentUser, planId: string | string[] | undefined) {
  if (typeof planId !== "string" || !planId) return null;
  const plan = await prisma.plan.findFirst({ where: { id: planId, ...visiblePlans(user) }, select: { id: true, title: true, date: true } });
  if (!plan) return null;
  return { href: `/plans/${plan.id}`, label: `Back to ${plan.title ?? formatPlanDate(plan.date, "short")}` };
}

export function describeService(plan: { date: Date; startTime: string | null; title: string | null; serviceType: { name: string } }) {
  return `${plan.title ?? plan.serviceType.name} on ${formatPlanDate(plan.date)}${plan.startTime ? ` at ${formatClock(plan.startTime)}` : ""}`;
}

// ----- Answering -----

// An answer covers every position the person holds on that plan.
export async function recordResponse(personId: string, planId: string, answer: "confirm" | "decline", reason?: string | null) {
  await prisma.assignment.updateMany({
    where: { personId, planId },
    data: {
      status: answer === "confirm" ? "CONFIRMED" : "DECLINED",
      declineReason: answer === "decline" ? reason?.trim() || null : null,
      respondedAt: new Date(),
    },
  });
}

// ----- Conflicts -----

// For one plan: who is blocked out that day, and who is on another plan that day.
// How a blackout's note starts, so the plan page can tell it from other clashes.
export const BLOCKED_OUT = "blocked out";

export async function conflictsOn(organizationId: string, planId: string, date: Date) {
  const [blackouts, others] = await Promise.all([
    prisma.blackout.findMany({
      where: { person: { organizationId }, startDate: { lte: date }, endDate: { gte: date } },
    }),
    prisma.assignment.findMany({
      where: { planId: { not: planId }, plan: { organizationId, date }, status: { not: "DECLINED" } },
      include: { plan: { include: { serviceType: true } } },
    }),
  ]);

  const conflicts = new Map<string, string[]>();
  const add = (personId: string, note: string) => {
    const notes = conflicts.get(personId) ?? [];
    if (!notes.includes(note)) notes.push(note);
    conflicts.set(personId, notes);
  };
  for (const blackout of blackouts) add(blackout.personId, blackout.reason ? `${BLOCKED_OUT}: ${blackout.reason}` : BLOCKED_OUT);
  for (const other of others) add(other.personId, `also on ${other.plan.title ?? other.plan.serviceType.name}`);
  return conflicts;
}

// Everyone who could go on a position, for the sheet of people: who holds it, and what
// stands in the way. Someone already on the position isn't offered.
export function describeCandidates(
  people: { id: string; firstName: string; lastName: string }[],
  holders: Set<string>,
  assigned: Set<string>,
  conflicts: Map<string, string[]>
) {
  return people
    .filter((person) => !assigned.has(person.id))
    .map((person) => {
      const notes = conflicts.get(person.id) ?? [];
      const out = notes.find((note) => note.startsWith(BLOCKED_OUT));
      return {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        holder: holders.has(person.id),
        out: out ? out.replace(BLOCKED_OUT, "Out") : null,
        note: notes.filter((note) => note !== out).join("; ") || null,
      };
    });
}

// ----- Auto-schedule -----

// How far around the plans to look at who has served. It takes in whole months, for
// the monthly limits, and the eight weeks the turn-taking looks back and ahead.
const SERVING_MARGIN_DAYS = 70;

export type ProposedPlan = {
  id: string;
  heading: string;
  usesNoPositions: boolean;
  placed: (AutoPlanResult["placed"][number] & { personName: string; positionName: string })[];
  open: { positionName: string; count: number; optional: boolean; why: string[] }[];
};

// Who `autoSchedule` would put on the plans in this range, for the positions this
// person may fill: the needed ones, and the optional ones too if asked. Writes nothing.
export async function autoScheduleProposal(user: CurrentUser, range: { from: Date; to: Date; serviceTypeId?: string; includeOptional?: boolean; planIds?: string[] }): Promise<ProposedPlan[]> {
  const organizationId = user.organizationId;
  const plans = await prisma.plan.findMany({
    where: { organizationId, date: { gte: range.from, lte: range.to }, ...(range.serviceTypeId ? { serviceTypeId: range.serviceTypeId } : {}), ...(range.planIds ? { id: { in: range.planIds } } : {}) },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: { serviceType: { select: { name: true } }, needs: true, assignments: { select: { personId: true, positionId: true, status: true } } },
  });
  const margin = SERVING_MARGIN_DAYS * 86_400_000;
  const [needs, positions, people, partners, serving] = await Promise.all([
    prisma.templatePosition.findMany({ where: { serviceTypeId: { in: plans.map((plan) => plan.serviceTypeId) } } }),
    prisma.position.findMany({ where: { team: { organizationId } }, select: { id: true, name: true, teamId: true, team: { select: { name: true } } } }),
    prisma.person.findMany({
      where: { organizationId, archived: false },
      include: {
        positions: { select: { positionId: true } },
        blackouts: { where: { startDate: { lte: range.to }, endDate: { gte: range.from } } },
      },
    }),
    prisma.servingPartner.findMany({ where: { personA: { organizationId } } }),
    prisma.assignment.findMany({
      where: {
        status: { not: "DECLINED" },
        plan: { organizationId, date: { gte: new Date(range.from.getTime() - margin), lte: new Date(range.to.getTime() + margin) } },
      },
      select: { personId: true, plan: { select: { date: true } } },
    }),
  ]);

  const positionById = new Map(positions.map((position) => [position.id, position]));
  const autoPlans = plans.map((plan) => {
    const all = planNeeds(needs.filter((need) => need.serviceTypeId === plan.serviceTypeId), plan.needs).filter((need) => positionById.has(need.positionId));
    const wanted = all.filter((need) => range.includeOptional || !need.optional);
    const live = plan.assignments.filter((a) => a.status !== "DECLINED");
    return {
      id: plan.id,
      date: toDateInput(plan.date),
      hasTemplate: all.length > 0,
      used: wanted.map((need) => need.positionId),
      open: wanted
        .filter((need) => canManageTeam(user, positionById.get(need.positionId)?.teamId ?? ""))
        .map((need) => ({ positionId: need.positionId, optional: need.optional, count: need.quantity - live.filter((a) => a.positionId === need.positionId).length })),
      on: live.map((a) => a.personId),
      declined: plan.assignments.filter((a) => a.status === "DECLINED").map((a) => a.personId),
    };
  });

  const nameOf = new Map(people.map((person) => [person.id, `${person.firstName} ${person.lastName}`]));
  const results = autoSchedule({
    plans: autoPlans,
    people: people.map((person) => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
      positionIds: person.positions.map((p) => p.positionId),
      maxPerMonth: person.maxPerMonth,
      weeks: person.preferredWeeks,
      blackouts: person.blackouts.map((b) => ({ start: toDateInput(b.startDate), end: toDateInput(b.endDate) })),
    })),
    partners: partners.map((partner) => ({ a: partner.personAId, b: partner.personBId, always: partner.always })),
    serving: serving.map((a) => ({ personId: a.personId, date: toDateInput(a.plan.date) })),
  });

  const resultFor = new Map(results.map((result) => [result.planId, result]));
  const positionName = (id: string) => {
    const position = positionById.get(id);
    return position ? `${position.team.name}: ${position.name}` : "A position";
  };
  return plans.map((plan, index) => {
    const result = resultFor.get(plan.id) as AutoPlanResult;
    return {
      id: plan.id,
      heading: `${formatPlanDate(plan.date, "short")} · ${plan.title ?? plan.serviceType.name}`,
      usesNoPositions: !autoPlans[index].hasTemplate,
      placed: result.placed.map((placement) => ({
        ...placement,
        personName: nameOf.get(placement.personId) ?? "Someone",
        positionName: positionName(placement.positionId),
      })),
      open: result.open.map((spot) => ({ positionName: positionName(spot.positionId), count: spot.count, optional: spot.optional, why: spot.why })),
    };
  });
}

// What Undo may take off: unanswered and not yet asked, on a service still to come,
// on a team this person manages. Anyone asked is expecting to serve, so they stay.
export async function undoableAssignments(user: CurrentUser) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { timezone: true } });
  return {
    status: "PENDING" as const,
    notifiedAt: null,
    plan: { organizationId: user.organizationId, date: { gte: todayInZone(org.timezone) } },
    ...(hasRole(user.role, "PLANNER") ? {} : { position: { teamId: { in: user.leadsTeamIds } } }),
  };
}

export type UndoableRun = { id: string; positions: number; services: number };

// The latest run with anything left to undo, on these plans if given.
export async function undoableAutoRun(user: CurrentUser, planIds?: string[]): Promise<UndoableRun | null> {
  const where = await undoableAssignments(user);
  const run = await prisma.autoScheduleRun.findFirst({
    where: { organizationId: user.organizationId, assignments: { some: { ...where, ...(planIds ? { planId: { in: planIds } } : {}) } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, assignments: { where, select: { planId: true } } },
  });
  return run && { id: run.id, positions: run.assignments.length, services: new Set(run.assignments.map((a) => a.planId)).size };
}

// Who hasn't been asked yet on these plans, on the teams this person manages. The
// counts leave out people with no email address; `ids` keeps them, so they're reported.
// Each person gets one email, however many services they're on.
export async function unaskedOn(user: CurrentUser, planIds: string[]) {
  const pending = await prisma.assignment.findMany({
    where: { planId: { in: planIds }, plan: { organizationId: user.organizationId }, status: "PENDING", notifiedAt: null },
    select: { id: true, planId: true, personId: true, position: { select: { teamId: true } }, person: { select: { email: true, archived: true } } },
  });
  const mine = pending.filter((a) => canManageTeam(user, a.position.teamId));
  const reachable = mine.filter((a) => a.person.email && !a.person.archived);
  return {
    ids: mine.map((a) => a.id),
    people: new Set(reachable.map((a) => a.personId)).size,
    services: new Set(reachable.map((a) => a.planId)).size,
  };
}

// ----- Sending -----

// A wait between messages, to stay under the email service's rate limit.
const SEND_GAP_MS = 600;

export type SendResult = { sent: number; noEmail: number; failed: number; notConfigured: boolean };

// Emails the people behind these assignments and stamps the ones actually sent. A
// request or reminder is one message per person, however many services it covers; a
// heads-up before a service is one per service. One that fails is counted and the
// rest still go; it stays unstamped, so it can be sent again.
export async function sendScheduleEmails(assignmentIds: string[], kind: ScheduleEmailKind): Promise<SendResult> {
  const assignments = await prisma.assignment.findMany({
    where: { id: { in: assignmentIds } },
    include: {
      person: true,
      position: { include: { team: true } },
      plan: { include: { serviceType: true, organization: true, times: true } },
    },
    orderBy: [{ plan: { date: "asc" } }, { plan: { startTime: "asc" } }, { position: { team: { sortOrder: "asc" } } }, { position: { sortOrder: "asc" } }],
  });

  const groups = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const key = kind === "service" ? `${assignment.planId}:${assignment.personId}` : assignment.personId;
    groups.set(key, [...(groups.get(key) ?? []), assignment]);
  }

  const result: SendResult = { sent: 0, noEmail: 0, failed: 0, notConfigured: false };
  const stamp = kind === "request" ? "notifiedAt" : kind === "reminder" ? "reminderSentAt" : "serviceReminderSentAt";

  for (const group of groups.values()) {
    const { person, plan } = group[0];
    if (!person.email || person.archived) {
      result.noEmail++;
      continue;
    }
    const services = [...new Set(group.map((a) => a.planId))].map((planId) => {
      const held = group.filter((a) => a.planId === planId);
      return {
        service: describeService(held[0].plan),
        positions: held.map((a) => `${a.position.team.name}: ${a.position.name}`),
        times: sortPlanTimes(held[0].plan.times).map((time) => describePlanTime(held[0].plan.date, time)),
      };
    });
    const message =
      kind !== "service" && services.length > 1
        ? scheduleListEmail(kind, { firstName: person.firstName, orgName: plan.organization.name, services, url: serviceListUrl(person.id) })
        : scheduleEmail(kind, {
            firstName: person.firstName,
            orgName: plan.organization.name,
            ...services[0],
            confirmUrl: responseUrl(group[0].id, "confirm"),
            declineUrl: responseUrl(group[0].id, "decline"),
          });

    let sent: boolean;
    try {
      ({ sent } = await sendEmail({ to: person.email, ...message }));
    } catch (error) {
      console.error(error);
      result.failed++;
      continue;
    }
    if (!sent) {
      result.notConfigured = true;
      continue;
    }
    result.sent++;
    await prisma.assignment.updateMany({
      where: { id: { in: group.map((a) => a.id) } },
      data: { [stamp]: new Date() },
    });
    await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
  }
  return result;
}
