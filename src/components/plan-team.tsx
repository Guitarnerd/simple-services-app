import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canManageTeam, type CurrentUser } from "@/lib/dal";
import { planNeeds } from "@/lib/auto-schedule";
import { conflictsOn, describeCandidates, undoableAutoRun } from "@/lib/schedule";
import { removeAssignment } from "@/lib/actions/schedule";
import { hasRole } from "@/lib/roles";
import { toDateInput } from "@/lib/format";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/status";
import { SendRequestsForm, StatusSelect } from "@/components/schedule-forms";
import { AutoScheduleButton, UndoAutoSchedule } from "@/components/auto-schedule";
import { AddNeededPositions } from "@/components/add-needed-positions";
import { AssignPerson } from "@/components/assign-person";
import { NewPlanPositionForm } from "@/components/team-forms";
import { TeamBlock } from "@/components/team-block";
import { Avatar, Icon } from "@/components/ui";

// Who is serving on a plan, by team and position, with their answers.
// People who manage a team can add and remove its people here, and add a position
// to the team. Only teams this service uses are listed. `newPositionId` is a position
// just added from this plan: it is shown with the needed ones until someone is on it.
export async function PlanTeam({ plan, user, newPositionId }: { plan: { id: string; date: Date; serviceTypeId: string }; user: CurrentUser; newPositionId?: string }) {
  const [teams, assignments, people, conflicts, template, planOwn, lastRun] = await Promise.all([
    prisma.team.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { sortOrder: "asc" },
      include: { positions: { orderBy: { sortOrder: "asc" }, include: { people: { select: { personId: true } } } } },
    }),
    prisma.assignment.findMany({
      where: { planId: plan.id },
      include: { person: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: [{ person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
    }),
    prisma.person.findMany({
      where: { organizationId: user.organizationId, archived: false },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    conflictsOn(user.organizationId, plan.id, plan.date),
    // What the service type's template says this service needs, and this plan's changes to that.
    prisma.templatePosition.findMany({ where: { serviceTypeId: plan.serviceTypeId } }),
    prisma.planPosition.findMany({ where: { planId: plan.id } }),
    hasRole(user.role, "LEADER") ? undoableAutoRun(user, [plan.id]) : null,
  ]);

  const needed = planNeeds(template, planOwn);
  const managed = new Set(teams.filter((team) => canManageTeam(user, team.id)).map((team) => team.id));
  const positionTeam = new Map(teams.flatMap((team) => team.positions.map((p) => [p.id, team.id] as const)));
  const mine = assignments.filter((a) => managed.has(positionTeam.get(a.positionId) ?? ""));
  const notAsked = new Set(mine.filter((a) => a.status === "PENDING" && !a.notifiedAt).map((a) => a.personId)).size;
  const waiting = new Set(mine.filter((a) => a.status === "PENDING" && a.notifiedAt).map((a) => a.personId)).size;
  const needs = new Map(needed.map((need) => [need.positionId, need.quantity]));
  // Optional positions are listed and can be filled, but never count as short.
  const optional = new Set(needed.filter((need) => need.optional).map((need) => need.positionId));
  const required = new Map(needed.filter((need) => !need.optional).map((need) => [need.positionId, need.quantity]));
  const canAddPeople = hasRole(user.role, "PLANNER");

  const inUse = (positionId: string) => needs.has(positionId) || positionId === newPositionId || assignments.some((a) => a.positionId === positionId);
  // A team this service doesn't use stays out of the way, unless someone is on it. Teams
  // with nobody scheduled are only worth showing to someone who can fill them.
  const shown = teams.filter((team) => assignments.some((a) => positionTeam.get(a.positionId) === team.id) || (managed.has(team.id) && team.positions.some((p) => inUse(p.id))));

  type TeamPosition = (typeof teams)[number]["positions"][number];

  function positionRow(position: TeamPosition, canManage: boolean) {
    const assigned = assignments.filter((a) => a.positionId === position.id);
    // Someone who said no doesn't fill the spot.
    const open = (needs.get(position.id) ?? 0) - assigned.filter((a) => a.status !== "DECLINED").length;
    const candidates = describeCandidates(people, new Set(position.people.map((p) => p.personId)), new Set(assigned.map((a) => a.personId)), conflicts);

    return (
      <li key={position.id} className="px-3 py-2.5">
        {/* The position is a quiet label; the people under it are what gets read. */}
        <div className="flex min-h-7 items-center gap-2">
          <span className="muted min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide">{position.name}</span>
          {canManage && open > 0 && !optional.has(position.id) && <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{open} needed</span>}
          {/* Only for schedulers: nobody serving should read their spot as unnecessary. */}
          {canManage && optional.has(position.id) && <span className="muted shrink-0 rounded-lg border border-line px-2 py-0.5 text-xs font-medium">Optional</span>}
          {canManage && <AssignPerson planId={plan.id} positionId={position.id} positionName={position.name} people={candidates} canAddPeople={canAddPeople} />}
        </div>

        {assigned.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1.5">
            {assigned.map((assignment) => {
              const name = `${assignment.person.firstName} ${assignment.person.lastName}`;
              const notes = conflicts.get(assignment.personId);
              // What a scheduler should know about this person, under their name.
              const quiet = [assignment.status === "PENDING" && !assignment.notifiedAt && "Not asked yet", assignment.declineReason && `“${assignment.declineReason}”`].filter(Boolean);
              const warnings = [!assignment.person.email && "No email", ...(notes ?? [])].filter(Boolean);
              return (
                <li key={assignment.id} className="flex items-start gap-2">
                  <Avatar name={name} className="mt-0.5 h-6 w-6 shrink-0 text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/people/${assignment.personId}`} className="block truncate text-sm font-medium hover:underline">
                      {name}
                    </Link>
                    {canManage && (quiet.length > 0 || warnings.length > 0) && (
                      <p className="text-xs">
                        {quiet.length > 0 && <span className="muted">{quiet.join(" · ")}</span>}
                        {quiet.length > 0 && warnings.length > 0 && <span className="muted"> · </span>}
                        {warnings.length > 0 && <span className="text-red-600 dark:text-red-400">{warnings.join(" · ")}</span>}
                      </p>
                    )}
                  </div>
                  {canManage ? (
                    <StatusSelect assignmentId={assignment.id} status={assignment.status} personName={name} />
                  ) : (
                    <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[assignment.status]}`}>{STATUS_LABELS[assignment.status]}</span>
                  )}
                  {canManage && (
                    <form action={removeAssignment} className="shrink-0">
                      <input type="hidden" name="assignmentId" value={assignment.id} />
                      <button type="submit" aria-label={`Remove ${name} from ${position.name}`} title="Remove" className="muted flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                        <Icon name="close" className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  }

  // The whole plan at a glance: people by answer, and spots still open.
  const visible = assignments.filter((a) => shown.some((team) => team.id === positionTeam.get(a.positionId)));
  const peopleWith = (status: (typeof assignments)[number]["status"]) => new Set(visible.filter((a) => a.status === status).map((a) => a.personId)).size;
  const openSpots = (positions: TeamPosition[], wanted = required) =>
    positions.reduce((sum, p) => sum + Math.max(0, (wanted.get(p.id) ?? 0) - assignments.filter((a) => a.positionId === p.id && a.status !== "DECLINED").length), 0);
  const managedPositions = shown.filter((team) => managed.has(team.id)).flatMap((team) => team.positions);
  const unfilled = openSpots(managedPositions);
  const totals = [
    { count: peopleWith("CONFIRMED"), label: "confirmed", dot: "bg-green-500" },
    { count: peopleWith("PENDING"), label: "waiting", dot: "bg-amber-500" },
    { count: peopleWith("DECLINED"), label: "declined", dot: "bg-red-500" },
    { count: unfilled, label: "unfilled", dot: "border border-neutral-400 dark:border-neutral-500" },
  ].filter((total) => total.count > 0);

  return (
    <section className="panel">
      <h2 className="panel-head">Team</h2>
      <div className="panel-body flex flex-col gap-3">
        {totals.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {totals.map((total) => (
              <li key={total.label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${total.dot}`} />
                <span className="font-semibold tabular-nums">{total.count}</span>
                <span className="muted">{total.label}</span>
              </li>
            ))}
          </ul>
        )}

        <SendRequestsForm planId={plan.id} notAsked={notAsked} waiting={waiting} />

        {openSpots(managedPositions, needs) > 0 && (
          <AutoScheduleButton planIds={[plan.id]} reviewHref={`/plans/auto-schedule?from=${toDateInput(plan.date)}&to=${toDateInput(plan.date)}&type=${plan.serviceTypeId}&plan=${plan.id}`} className="btn btn-secondary w-fit">
            Auto-schedule open spots
          </AutoScheduleButton>
        )}
        {lastRun && <UndoAutoSchedule run={lastRun} />}

        {managed.size > 0 && (
          <AddNeededPositions
            planId={plan.id}
            teams={teams
              .filter((team) => managed.has(team.id) && team.positions.length > 0)
              .map((team) => ({
                id: team.id,
                name: team.name,
                positions: team.positions.map((p) => ({ id: p.id, name: p.name, quantity: needs.get(p.id) ?? 0, optional: optional.has(p.id) })),
              }))}
          />
        )}

        {shown.length === 0 && <p className="muted text-sm">{managed.size > 0 ? "No positions on this service yet." : "No one is scheduled yet."}</p>}

        {shown.map((team) => {
          const canManage = managed.has(team.id);
          // The positions this service uses come first and the rest tuck away.
          const main = team.positions.filter((p) => (canManage ? inUse(p.id) : assignments.some((a) => a.positionId === p.id)));
          const others = canManage ? team.positions.filter((p) => !inUse(p.id)) : [];

          // "3 of 5 filled" when the template says what's needed; otherwise how many people.
          const wanted = team.positions.reduce((sum, p) => sum + (required.get(p.id) ?? 0), 0);
          const short = canManage ? openSpots(team.positions) : 0;
          const scheduled = new Set(assignments.filter((a) => positionTeam.get(a.positionId) === team.id && a.status !== "DECLINED").map((a) => a.personId)).size;
          const summary = canManage && wanted > 0 ? `${wanted - short} of ${wanted} filled` : `${scheduled} scheduled`;

          return (
            <TeamBlock key={team.id} name={team.name} summary={summary} short={short > 0}>
              {main.length > 0 && <ul className="divide-y divide-black/10 dark:divide-white/10">{main.map((position) => positionRow(position, canManage))}</ul>}
              {main.length === 0 && !canManage && <p className="muted px-3 py-2.5 text-sm">No one is scheduled yet.</p>}
              {(others.length > 0 || canManage) && (
                <div className="border-t border-black/10 px-3 py-1.5 dark:border-white/10">
                  {others.length > 0 && (
                    <details>
                      <summary className="muted cursor-pointer py-1 text-sm hover:text-indigo-600 dark:hover:text-indigo-300">
                        {main.length > 0 ? "Other positions" : "Not needed for this service"} ({others.length})
                      </summary>
                      <ul className="-mx-3 divide-y divide-black/10 dark:divide-white/10">{others.map((position) => positionRow(position, canManage))}</ul>
                    </details>
                  )}
                  {canManage && <NewPlanPositionForm teamId={team.id} planId={plan.id} teamName={team.name} />}
                </div>
              )}
            </TeamBlock>
          );
        })}
      </div>
    </section>
  );
}
