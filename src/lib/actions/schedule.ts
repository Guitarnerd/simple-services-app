"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canEditPerson, canManageTeam, getCurrentUser, requireRole } from "@/lib/dal";
import { hasRole } from "@/lib/roles";
import { formatPlanDate, todayInZone } from "@/lib/format";
import { autoScheduleProposal, conflictsOn, describeCandidates, recordResponse, sendScheduleEmails, unaskedOn, undoableAssignments, verifyResponseLink, verifyServiceListLink, type ProposedPlan, type SendResult } from "@/lib/schedule";
import type { FormState } from "@/components/form";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

// ----- Scheduling people on a plan -----

export async function addAssignment(formData: FormData) {
  const user = await getCurrentUser();
  const planId = field(formData, "planId");
  const personId = field(formData, "personId");

  const [plan, position, person] = await Promise.all([
    prisma.plan.findFirst({ where: { id: planId, organizationId: user.organizationId } }),
    prisma.position.findFirst({ where: { id: field(formData, "positionId"), team: { organizationId: user.organizationId } } }),
    prisma.person.findFirst({ where: { id: personId, organizationId: user.organizationId, archived: false } }),
  ]);
  if (!plan || !position || !person || !canManageTeam(user, position.teamId)) return;

  // Someone who has blocked out that date can't be scheduled on it.
  const blockedOut = await prisma.blackout.findFirst({ where: { personId, startDate: { lte: plan.date }, endDate: { gte: plan.date } } });
  if (blockedOut) return;

  await prisma.assignment.upsert({
    where: { planId_personId_positionId: { planId, personId, positionId: position.id } },
    update: {},
    create: { planId, personId, positionId: position.id },
  });
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/plans/multi-view");
}

// The sheet of people for a position, for the matrix, which would otherwise need every
// person for every position in every column.
export async function positionCandidates(planId: string, positionId: string) {
  const user = await getCurrentUser();
  const [plan, position, people] = await Promise.all([
    prisma.plan.findFirst({ where: { id: planId, organizationId: user.organizationId }, include: { assignments: { where: { positionId }, select: { personId: true } } } }),
    prisma.position.findFirst({ where: { id: positionId, team: { organizationId: user.organizationId } }, include: { people: { select: { personId: true } } } }),
    prisma.person.findMany({ where: { organizationId: user.organizationId, archived: false }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
  ]);
  if (!plan || !position || !canManageTeam(user, position.teamId)) return [];

  const conflicts = await conflictsOn(user.organizationId, plan.id, plan.date);
  return describeCandidates(people, new Set(position.people.map((p) => p.personId)), new Set(plan.assignments.map((a) => a.personId)), conflicts);
}

// Someone else in the same spot. They start as not asked, and the person they replace
// isn't told.
export async function swapAssignment(formData: FormData) {
  const assignment = await managedAssignment(field(formData, "assignmentId"));
  if (!assignment) return;
  const user = await getCurrentUser();
  const personId = field(formData, "personId");
  const [plan, person] = await Promise.all([
    prisma.plan.findUnique({ where: { id: assignment.planId } }),
    prisma.person.findFirst({ where: { id: personId, organizationId: user.organizationId, archived: false } }),
  ]);
  if (!plan || !person) return;

  // As when adding someone: a blackout can't be scheduled over.
  const blockedOut = await prisma.blackout.findFirst({ where: { personId, startDate: { lte: plan.date }, endDate: { gte: plan.date } } });
  if (blockedOut) return;
  const { planId, positionId } = assignment;
  if (await prisma.assignment.findUnique({ where: { planId_personId_positionId: { planId, personId, positionId } } })) return;

  await prisma.$transaction([prisma.assignment.delete({ where: { id: assignment.id } }), prisma.assignment.create({ data: { planId, personId, positionId } })]);
  revalidateSchedule([planId]);
}

// A person dragged to another service on the matrix, in the same position. They start
// again there as not asked, and a move takes them off the first service.
export async function placeOnPlan(assignmentId: string, planId: string, mode: "copy" | "move"): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  const [assignment, plan] = await Promise.all([managedAssignment(assignmentId), prisma.plan.findFirst({ where: { id: planId, organizationId: user.organizationId } })]);
  if (!assignment) return { error: "That person is no longer on that service, or you don't manage that team." };
  if (!plan) return { error: "That service no longer exists." };

  const { personId, positionId } = assignment;
  const blockedOut = await prisma.blackout.findFirst({ where: { personId, startDate: { lte: plan.date }, endDate: { gte: plan.date } } });
  if (blockedOut) return { error: `They're blocked out on ${formatPlanDate(plan.date, "short")}.` };
  const taken = await prisma.assignment.findUnique({ where: { planId_personId_positionId: { planId, personId, positionId } } });
  if (taken) return { error: `They're already in that position on ${formatPlanDate(plan.date, "short")}.` };

  await prisma.$transaction([prisma.assignment.create({ data: { planId, personId, positionId } }), ...(mode === "move" ? [prisma.assignment.delete({ where: { id: assignment.id } })] : [])]);
  revalidateSchedule([planId, assignment.planId]);
  return {};
}

export type AutoScheduleCount = { positions: number; services: number; picks: string[] };

function countProposal(plans: ProposedPlan[]): AutoScheduleCount {
  const filled = plans.filter((plan) => plan.placed.length > 0);
  return {
    positions: filled.reduce((sum, plan) => sum + plan.placed.length, 0),
    services: filled.length,
    picks: filled.flatMap((plan) => plan.placed.map((placement) => `${plan.id}:${placement.positionId}:${placement.personId}`)),
  };
}

// What Auto-schedule would do to these plans, both ways, for the confirmation. Writes
// nothing. Past plans are left alone, as on the auto-schedule page.
export async function previewAutoSchedule(planIds: string[]) {
  const user = await requireRole("LEADER");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { timezone: true } });
  const plans = await prisma.plan.findMany({
    where: { id: { in: planIds }, organizationId: user.organizationId, date: { gte: todayInZone(org.timezone) } },
    orderBy: { date: "asc" },
    select: { id: true, date: true },
  });
  if (plans.length === 0) {
    const nothing = countProposal([]);
    return { needed: nothing, all: nothing };
  }

  const range = { from: plans[0].date, to: plans[plans.length - 1].date, planIds: plans.map((plan) => plan.id) };
  return {
    needed: countProposal(await autoScheduleProposal(user, range)),
    all: countProposal(await autoScheduleProposal(user, { ...range, includeOptional: true })),
  };
}

// What was confirmed: "planId:positionId:personId" for each spot. Each is checked again
// here, since the page may be stale or the form altered.
export async function applyAutoSchedule(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("LEADER");
  const picks = formData.getAll("pick").map((pick) => String(pick).split(":"));
  if (picks.length === 0) return { error: "Tick at least one person." };

  const [plans, positions, people, blackouts] = await Promise.all([
    prisma.plan.findMany({ where: { id: { in: picks.map((p) => p[0]) }, organizationId: user.organizationId } }),
    prisma.position.findMany({ where: { id: { in: picks.map((p) => p[1]) }, team: { organizationId: user.organizationId } } }),
    prisma.person.findMany({ where: { id: { in: picks.map((p) => p[2]) }, organizationId: user.organizationId, archived: false }, include: { positions: { select: { positionId: true } } } }),
    prisma.blackout.findMany({ where: { personId: { in: picks.map((p) => p[2]) } } }),
  ]);

  const data = picks.flatMap(([planId, positionId, personId]) => {
    const plan = plans.find((p) => p.id === planId);
    const position = positions.find((p) => p.id === positionId);
    const person = people.find((p) => p.id === personId);
    if (!plan || !position || !person || !canManageTeam(user, position.teamId)) return [];
    if (!person.positions.some((p) => p.positionId === positionId)) return [];
    if (blackouts.some((b) => b.personId === personId && b.startDate <= plan.date && plan.date <= b.endDate)) return [];
    return [{ planId, positionId, personId }];
  });

  if (data.length === 0) return { error: "Those people can't be added any more. Reload and try again." };

  const run = await prisma.autoScheduleRun.create({ data: { organizationId: user.organizationId } });
  const { count } = await prisma.assignment.createMany({ data: data.map((row) => ({ ...row, autoRunId: run.id })), skipDuplicates: true });
  revalidateSchedule(data.map((row) => row.planId));
  return { ok: `Added ${count} ${count === 1 ? "person" : "people"}. Nobody has been emailed yet.` };
}

// Takes a run's people back off. Anyone already asked or answered stays.
export async function undoAutoSchedule(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("LEADER");
  const run = await prisma.autoScheduleRun.findFirst({ where: { id: field(formData, "runId"), organizationId: user.organizationId } });
  if (!run) return { error: "That auto-schedule no longer exists." };

  const rows = await prisma.assignment.findMany({ where: { ...(await undoableAssignments(user)), autoRunId: run.id }, select: { id: true, planId: true } });
  if (rows.length === 0) return { error: "There's nothing left to undo." };

  await prisma.assignment.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
  revalidateSchedule(rows.map((row) => row.planId));

  const kept = await prisma.assignment.count({ where: { autoRunId: run.id } });
  return { ok: `Undone.${kept > 0 ? ` ${kept} already asked ${kept === 1 ? "stays" : "stay"} on.` : ""}` };
}

function revalidateSchedule(planIds: string[]) {
  for (const planId of new Set(planIds)) revalidatePath(`/plans/${planId}`);
  revalidatePath("/plans/auto-schedule");
  revalidatePath("/plans/multi-view");
  revalidatePath("/");
}

// Someone who isn't in People yet, added from a plan: makes the person, gives them
// the position, and schedules them, in one go.
export async function addNewPersonToPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  // Adding people is for planners, here as on the People page.
  if (!hasRole(user.role, "PLANNER")) return { error: "You don't have permission to do that." };

  const planId = field(formData, "planId");
  const [plan, position] = await Promise.all([
    prisma.plan.findFirst({ where: { id: planId, organizationId: user.organizationId } }),
    prisma.position.findFirst({ where: { id: field(formData, "positionId"), team: { organizationId: user.organizationId } } }),
  ]);
  if (!plan || !position) return { error: "That plan or position no longer exists." };

  const firstName = field(formData, "firstName");
  const lastName = field(formData, "lastName");
  const email = field(formData, "email").toLowerCase() || null;
  if (!firstName || !lastName) return { error: "Give a first and last name." };
  if (email && !z.email().safeParse(email).success) return { error: "That email address doesn't look right." };
  if (email) {
    const taken = await prisma.person.findUnique({ where: { email } });
    if (taken) return { error: `${email} already belongs to ${taken.firstName} ${taken.lastName}.` };
  }

  await prisma.person.create({
    data: {
      organizationId: user.organizationId,
      firstName,
      lastName,
      email,
      positions: { create: { positionId: position.id } },
      assignments: { create: { planId, positionId: position.id } },
    },
  });
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/plans/multi-view");
  return { ok: `Added ${firstName} ${lastName}.` };
}

// The assignment, if the current user manages its team.
async function managedAssignment(assignmentId: string) {
  const user = await getCurrentUser();
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, plan: { organizationId: user.organizationId } },
    include: { position: true },
  });
  return assignment && canManageTeam(user, assignment.position.teamId) ? assignment : null;
}

export async function removeAssignment(formData: FormData) {
  const assignment = await managedAssignment(field(formData, "assignmentId"));
  if (!assignment) return;
  await prisma.assignment.delete({ where: { id: assignment.id } });
  revalidatePath(`/plans/${assignment.planId}`);
}

// A scheduler recording an answer given in person or by text.
export async function setAssignmentStatus(formData: FormData) {
  const assignment = await managedAssignment(field(formData, "assignmentId"));
  const status = field(formData, "status");
  if (!assignment || (status !== "PENDING" && status !== "CONFIRMED" && status !== "DECLINED")) return;

  await prisma.assignment.update({
    where: { id: assignment.id },
    data: {
      status,
      respondedAt: status === "PENDING" ? null : new Date(),
      ...(status === "DECLINED" ? {} : { declineReason: null }),
    },
  });
  revalidatePath(`/plans/${assignment.planId}`);
}

// kind "request": everyone on the plan who hasn't been asked yet.
// kind "reminder": everyone who was asked and hasn't answered.
// Team leaders only reach the people on the teams they lead.
export async function sendRequests(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const planId = field(formData, "planId");
  const kind = field(formData, "kind") === "reminder" ? "reminder" : "request";

  const pending = await prisma.assignment.findMany({
    where: {
      planId,
      plan: { organizationId: user.organizationId },
      status: "PENDING",
      notifiedAt: kind === "request" ? null : { not: null },
    },
    include: { position: true },
  });
  const mine = pending.filter((a) => canManageTeam(user, a.position.teamId));
  if (mine.length === 0) return { error: kind === "request" ? "Everyone has already been asked." : "No one is waiting to answer." };

  const result = await sendScheduleEmails(
    mine.map((a) => a.id),
    kind
  );
  revalidatePath(`/plans/${planId}`);
  return describeSending(result, kind === "request" ? "Asked" : "Reminded");
}

// The matrix's button: everyone not yet asked, across the plans in view.
export async function sendUnaskedRequests(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("LEADER");
  const planIds = formData.getAll("planId").map(String);
  const unasked = await unaskedOn(user, planIds);
  if (unasked.people === 0) return { error: "Everyone with an email address has already been asked." };

  const result = await sendScheduleEmails(unasked.ids, "request");
  revalidateSchedule(planIds);
  return describeSending(result, "Emailed");
}

function describeSending(result: SendResult, verb: string): FormState {
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  const skipped = result.noEmail > 0 ? ` ${people(result.noEmail)} had no email address.` : "";
  if (result.notConfigured) {
    return { error: `Email isn't set up yet, so nothing was sent. People can still answer from their home page.${skipped}` };
  }
  if (result.failed > 0) {
    return { error: `${verb} ${people(result.sent)}, but ${result.failed} couldn't be sent. Press again to retry those.${skipped}` };
  }
  return { ok: `${verb} ${people(result.sent)}.${skipped}` };
}

// ----- Answering a request -----

// Signed in, from the home page.
export async function respond(formData: FormData) {
  const user = await getCurrentUser();
  const planId = field(formData, "planId");
  const answer = field(formData, "answer") === "confirm" ? "confirm" : "decline";
  await recordResponse(user.id, planId, answer, field(formData, "reason"));
  revalidatePath("/");
  revalidatePath(`/plans/${planId}`);
}

// Not signed in, from the link in an email.
export async function respondFromLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const assignmentId = field(formData, "assignmentId");
  if (!verifyResponseLink(assignmentId, field(formData, "token"))) return { error: "This link isn't valid." };

  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) return { error: "This request has been withdrawn, so there's nothing to answer." };

  const answer = field(formData, "answer") === "confirm" ? "confirm" : "decline";
  await recordResponse(assignment.personId, assignment.planId, answer, field(formData, "reason"));
  revalidatePath(`/plans/${assignment.planId}`);
  return { ok: answer === "confirm" ? "Thanks! You're confirmed." : "Thanks for letting us know." };
}

// Not signed in, from the list an email covering several services links to.
export async function respondFromList(formData: FormData) {
  const personId = field(formData, "personId");
  if (!verifyServiceListLink(personId, field(formData, "token"))) return;

  const planId = field(formData, "planId");
  const answer = field(formData, "answer") === "confirm" ? "confirm" : "decline";
  await recordResponse(personId, planId, answer, field(formData, "reason"));
  revalidatePath(`/respond/person/${personId}`);
  revalidatePath(`/plans/${planId}`);
}

// ----- Blackout dates -----

function readDate(formData: FormData, name: string) {
  const value = field(formData, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function saveServingPreferences(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const personId = field(formData, "personId");
  if (!canEditPerson(user, personId)) return { error: "You don't have permission to do that." };

  const limit = Number(field(formData, "maxPerMonth"));
  const weeks = [...new Set(formData.getAll("week").map(Number))].filter((week) => Number.isInteger(week) && week >= 1 && week <= 5).sort();
  const { count } = await prisma.person.updateMany({
    where: { id: personId, organizationId: user.organizationId },
    data: { maxPerMonth: Number.isInteger(limit) && limit > 0 && limit <= 31 ? limit : null, preferredWeeks: weeks },
  });
  if (count === 0) return { error: "That person no longer exists." };
  revalidatePath("/account");
  revalidatePath(`/people/${personId}`);
  return { ok: "Saved." };
}

// A pair is kept once, lowest id first, whichever page it was added from.
function partnerKey(one: string, other: string) {
  const [personAId, personBId] = [one, other].sort();
  return { personAId, personBId };
}

export async function addServingPartner(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const personId = field(formData, "personId");
  const partnerId = field(formData, "partnerId");
  if (!partnerId) return { error: "Pick a person." };
  if (personId === partnerId) return { error: "Pick someone else." };

  const found = await prisma.person.count({ where: { id: { in: [personId, partnerId] }, organizationId: user.organizationId } });
  if (found !== 2) return { error: "That person no longer exists." };

  const key = partnerKey(personId, partnerId);
  const always = field(formData, "always") === "true";
  await prisma.servingPartner.upsert({ where: { personAId_personBId: key }, update: { always }, create: { ...key, always } });
  revalidatePath(`/people/${personId}`);
  revalidatePath(`/people/${partnerId}`);
  return { ok: "Added." };
}

export async function removeServingPartner(formData: FormData) {
  const user = await requireRole("PLANNER");
  const personId = field(formData, "personId");
  const partnerId = field(formData, "partnerId");
  const key = partnerKey(personId, partnerId);
  await prisma.servingPartner.deleteMany({ where: { ...key, personA: { organizationId: user.organizationId } } });
  revalidatePath(`/people/${personId}`);
  revalidatePath(`/people/${partnerId}`);
}

export async function addBlackout(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const personId = field(formData, "personId");
  if (!canEditPerson(user, personId)) return { error: "You don't have permission to do that." };

  const person = await prisma.person.findFirst({ where: { id: personId, organizationId: user.organizationId } });
  if (!person) return { error: "That person no longer exists." };

  const startDate = readDate(formData, "startDate");
  const endDate = readDate(formData, "endDate") ?? startDate;
  if (!startDate || !endDate) return { error: "Pick a date." };
  if (endDate < startDate) return { error: "The last day can't be before the first day." };

  await prisma.blackout.create({
    data: { personId, startDate, endDate, reason: field(formData, "reason") || null },
  });
  revalidatePath("/account");
  revalidatePath(`/people/${personId}`);
  return { ok: "Added." };
}

export async function deleteBlackout(formData: FormData) {
  const user = await getCurrentUser();
  const blackout = await prisma.blackout.findFirst({
    where: { id: field(formData, "blackoutId"), person: { organizationId: user.organizationId } },
  });
  if (!blackout || !canEditPerson(user, blackout.personId)) return;

  await prisma.blackout.delete({ where: { id: blackout.id } });
  revalidatePath("/account");
  revalidatePath(`/people/${blackout.personId}`);
}
