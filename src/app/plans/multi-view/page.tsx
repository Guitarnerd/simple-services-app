import type { Metadata } from "next";
import Link from "next/link";
import { canManageTeam, getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { planNeeds } from "@/lib/auto-schedule";
import { unaskedOn, undoableAutoRun, visiblePlans } from "@/lib/schedule";
import { formatClock, formatPlanDate, nextSunday, toDateInput, todayInZone } from "@/lib/format";
import { Page } from "@/components/page";
import { PlanMatrix, type MatrixPlan } from "@/components/plan-matrix";
import { AutoScheduleButton, SendUnaskedForm, UndoAutoSchedule } from "@/components/auto-schedule";
import { NewServiceButton } from "@/components/new-service-button";

export const metadata: Metadata = { title: "Multi View" };

// How many services sit side by side.
const COLUMNS = 8;
// How many services either side of the one a plan's Multi View button came from.
const BEFORE_FOCUS = 1;
const AFTER_FOCUS = 2;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Upcoming plans as columns, to compare services and move rows between them. Past
// ones stay out of the way until asked for: ?past=8 puts the last eight on the left.
// From a plan, ?around=<plan> shows it with the one before and two after of its type.
export default async function MatrixPage({ searchParams }: PageProps<"/plans/multi-view">) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const focus = first(params.around) ? await prisma.plan.findFirst({ where: { id: first(params.around), ...visiblePlans(user) }, select: { id: true, title: true, date: true, serviceTypeId: true } }) : null;
  const typeId = focus?.serviceTypeId ?? first(params.type);
  const asked = Number(first(params.past));
  const pastCount = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 200) : 0;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
  const today = todayInZone(org.timezone);

  const serviceTypes = await prisma.serviceType.findMany({ where: { organizationId: user.organizationId }, orderBy: { sortOrder: "asc" } });
  const include = {
    serviceType: { select: { name: true } },
    items: { orderBy: { position: "asc" as const }, include: { song: { select: { arrangements: { orderBy: { sortOrder: "asc" as const }, select: { id: true, name: true } } } } } },
    needs: true,
    assignments: { include: { person: { select: { firstName: true, lastName: true } } } },
  };
  const scope = { ...visiblePlans(user), ...(typeId ? { serviceTypeId: typeId } : {}) };
  const inOrder = [{ date: "asc" as const }, { startTime: "asc" as const }, { id: "asc" as const }];

  async function aroundFocus(planId: string) {
    const all = await prisma.plan.findMany({ where: scope, orderBy: inOrder, select: { id: true } });
    const at = all.findIndex((plan) => plan.id === planId);
    const shown = all.slice(Math.max(0, at - BEFORE_FOCUS), at + AFTER_FOCUS + 1).map((plan) => plan.id);
    const found = await prisma.plan.findMany({ where: { id: { in: shown } }, orderBy: inOrder, include });
    const earlier = found.filter((plan) => plan.date < today);
    return [found.filter((plan) => plan.date >= today), earlier.reverse(), earlier.length] as const;
  }

  const [upcoming, past, pastTotal] = focus
    ? await aroundFocus(focus.id)
    : await Promise.all([
        prisma.plan.findMany({ where: { ...scope, date: { gte: today } }, orderBy: [{ date: "asc" }, { startTime: "asc" }], take: COLUMNS, include }),
        pastCount > 0 ? prisma.plan.findMany({ where: { ...scope, date: { lt: today } }, orderBy: [{ date: "desc" }, { startTime: "desc" }], take: pastCount, include }) : [],
        prisma.plan.count({ where: { ...scope, date: { lt: today } } }),
      ]);
  const plans = [...[...past].reverse(), ...upcoming];
  const [positions, template] = await Promise.all([
    prisma.position.findMany({ where: { team: { organizationId: user.organizationId } }, orderBy: [{ team: { sortOrder: "asc" } }, { sortOrder: "asc" }], include: { team: { select: { name: true } } } }),
    prisma.templatePosition.findMany({ where: { serviceTypeId: { in: plans.map((plan) => plan.serviceTypeId) } } }),
  ]);

  const columns: MatrixPlan[] = plans.map((plan) => {
    const needs = new Map(planNeeds(template.filter((need) => need.serviceTypeId === plan.serviceTypeId), plan.needs).map((need) => [need.positionId, need]));
    const team = positions.flatMap((position) => {
      const canManage = canManageTeam(user, position.teamId);
      const here = plan.assignments.filter((a) => a.positionId === position.id);
      const need = needs.get(position.id);
      // As on the plan: what the service uses, for those who can fill it, and whoever is on it.
      if (here.length === 0 && !(need && canManage)) return [];
      return [
        {
          positionId: position.id,
          position: position.name,
          canManage,
          // Someone who said no doesn't fill the spot.
          open: canManage ? Math.max(0, (need?.quantity ?? 0) - here.filter((a) => a.status !== "DECLINED").length) : 0,
          quantity: canManage ? (need?.quantity ?? 0) : 0,
          // Only for schedulers: nobody serving should read their spot as unnecessary.
          optional: canManage && (need?.optional ?? false),
          people: here.map((a) => ({ assignmentId: a.id, name: `${a.person.firstName} ${a.person.lastName}`, status: a.status, asked: Boolean(a.notifiedAt) || a.status !== "PENDING" })),
        },
      ];
    });
    return {
      id: plan.id,
      day: formatPlanDate(plan.date, "short"),
      title: plan.title ?? plan.serviceType.name,
      subtitle: [plan.title && plan.serviceType.name, plan.startTime && formatClock(plan.startTime)].filter(Boolean).join(" · "),
      items: plan.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        key: item.key,
        tag: item.type === "SONG" && item.tag,
        lengthSeconds: item.lengthSeconds,
        preService: item.preService,
        notes: item.notes,
        songId: item.songId,
        songHref: item.songId ? `/songs/${item.songId}?plan=${plan.id}` : null,
        arrangementId: item.arrangementId,
        arrangements: item.song?.arrangements ?? [],
      })),
      team,
    };
  });

  // What the song picker offers, for those who can change a row.
  const songs = hasRole(user.role, "PLANNER")
    ? await prisma.song.findMany({
        where: { organizationId: user.organizationId, archived: false },
        orderBy: { title: "asc" },
        select: { id: true, title: true, author: true, arrangements: { orderBy: { sortOrder: "asc" }, take: 1, select: { key: true, meter: true } } },
      })
    : [];

  // Scheduling and emails are for what's still to come, whatever else is showing.
  const canSchedule = hasRole(user.role, "LEADER") && upcoming.length > 0;
  const planIds = upcoming.map((plan) => plan.id);
  const [lastRun, unasked] = canSchedule ? await Promise.all([undoableAutoRun(user, planIds), unaskedOn(user, planIds)]) : [null, null];

  const address = (past: number) => `/plans/multi-view?${[typeId && `type=${typeId}`, past > 0 && `past=${past}`].filter(Boolean).join("&")}`;
  const lastDate = upcoming.at(-1)?.date ?? today;

  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-surface-raised text-neutral-900 shadow-sm dark:bg-white/15 dark:text-white" : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"}`;

  return (
    <Page
      title="Multi View"
      subtitle={
        focus ? "This service with the one before it and the two after it." : past.length > 0 ? `The last ${past.length} and next ${COLUMNS} services side by side.` : `The next ${COLUMNS} services side by side.`
      }
      back={focus ? { href: `/plans/${focus.id}`, label: `Back to ${focus.title ?? formatPlanDate(focus.date, "short")}` } : { href: "/plans", label: "Plans" }}
      wide
      actions={
        <>
          {hasRole(user.role, "PLANNER") && serviceTypes.length > 0 && (
            // The Sunday after the last one showing, so the usual case is one press.
            <NewServiceButton serviceTypes={serviceTypes} defaultDate={toDateInput(nextSunday(new Date(lastDate.getTime() + 86_400_000)))} defaultTypeId={typeId || undefined} />
          )}
          {pastTotal > past.length && (
            <Link href={address(past.length + COLUMNS)} className="btn btn-secondary">
              {past.length > 0 ? "Load earlier services" : "Load past services"}
            </Link>
          )}
          {focus && (
            <Link href={address(0)} className="btn btn-secondary">
              Show all services
            </Link>
          )}
          {past.length > 0 && !focus && (
            <Link href={address(0)} className="btn btn-secondary">
              Hide past services
            </Link>
          )}
          {canSchedule && (
            // The review page shows the same dates and service as the upcoming columns here.
            <AutoScheduleButton planIds={planIds} reviewHref={`/plans/auto-schedule?from=${toDateInput(upcoming[0].date)}&to=${toDateInput(upcoming[upcoming.length - 1].date)}${typeId ? `&type=${typeId}` : ""}`}>
              Auto-schedule these
            </AutoScheduleButton>
          )}
        </>
      }
    >
      {serviceTypes.length > 1 && (
        <nav aria-label="Service type" className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-black/[0.06] p-1 dark:bg-white/[0.08]">
          <Link href={`/plans/multi-view${pastCount > 0 ? `?past=${pastCount}` : ""}`} aria-current={!typeId ? "page" : undefined} className={tab(!typeId)}>
            All
          </Link>
          {serviceTypes.map((type) => (
            <Link key={type.id} href={`/plans/multi-view?type=${type.id}${pastCount > 0 ? `&past=${pastCount}` : ""}`} aria-current={typeId === type.id ? "page" : undefined} className={tab(typeId === type.id)}>
              {type.name}
            </Link>
          ))}
        </nav>
      )}

      {unasked && <SendUnaskedForm planIds={planIds} people={unasked.people} services={unasked.services} />}
      {lastRun && <UndoAutoSchedule run={lastRun} />}

      {columns.length === 0 ? (
        <p className="empty">No upcoming services to show.</p>
      ) : (
        // Keyed by what's in the plans, so a change made elsewhere starts the board afresh.
        <PlanMatrix
          key={JSON.stringify(columns.map((plan) => [plan.id, plan.items]))}
          plans={columns}
          positions={positions.filter((position) => canManageTeam(user, position.teamId)).map((position) => ({ id: position.id, name: position.name, teamName: position.team.name }))}
          songs={songs.map((song) => ({ id: song.id, title: song.title, author: song.author, key: song.arrangements[0]?.key ?? null, meter: song.arrangements[0]?.meter ?? null }))}
          canEdit={hasRole(user.role, "PLANNER")}
          canSchedule={hasRole(user.role, "LEADER")}
          canAddPeople={hasRole(user.role, "PLANNER")}
        />
      )}
    </Page>
  );
}
