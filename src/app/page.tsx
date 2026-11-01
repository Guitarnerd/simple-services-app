import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole, ROLE_LABELS } from "@/lib/roles";
import { formatClock, formatPlanDate, todayInZone } from "@/lib/format";
import { visiblePlans } from "@/lib/schedule";
import { planNeeds } from "@/lib/auto-schedule";
import { Page } from "@/components/page";
import { DateTile, Icon } from "@/components/ui";
import { MySchedule } from "@/components/my-schedule";
import { PersonCalendar } from "@/components/person-calendar";
import { FullscreenButton } from "@/components/fullscreen-button";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const user = await getCurrentUser();
  const isPlanner = hasRole(user.role, "PLANNER");
  const isLeader = hasRole(user.role, "LEADER");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });

  const today = todayInZone(org.timezone);

  const [upcoming, peopleCount, staffedTeams] = await Promise.all([
    prisma.plan.findMany({
      where: { ...visiblePlans(user), date: { gte: today } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 4,
      include: { serviceType: { select: { name: true } }, _count: { select: { items: { where: { type: "SONG" } } } } },
    }),
    prisma.person.count({ where: { organizationId: user.organizationId, archived: false } }),
    prisma.team.count({ where: { organizationId: user.organizationId, positions: { some: { people: { some: { person: { archived: false } } } } } } }),
  ]);

  // For schedulers: what still needs doing on the next service.
  const next = isLeader ? upcoming[0] : undefined;
  const [template, planOwn, assignments] = next
    ? await Promise.all([
        prisma.templatePosition.findMany({ where: { serviceTypeId: next.serviceTypeId } }),
        prisma.planPosition.findMany({ where: { planId: next.id } }),
        prisma.assignment.findMany({ where: { planId: next.id }, select: { positionId: true, personId: true, status: true } }),
      ])
    : [[], [], []];
  const needs = planNeeds(template, planOwn).filter((need) => !need.optional);
  // Someone who said no doesn't fill the spot.
  const unfilled = needs.reduce((sum, need) => sum + Math.max(0, need.quantity - assignments.filter((a) => a.positionId === need.positionId && a.status !== "DECLINED").length), 0);
  const waiting = new Set(assignments.filter((a) => a.status === "PENDING").map((a) => a.personId)).size;
  const nextDay = next ? formatPlanDate(next.date, "short") : "";
  const toDo = [
    unfilled > 0 && { count: unfilled, label: `${unfilled === 1 ? "position" : "positions"} unfilled for ${nextDay}`, tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
    waiting > 0 && { count: waiting, label: `${waiting === 1 ? "person hasn't" : "people haven't"} answered for ${nextDay}`, tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200" },
  ].filter((entry) => entry !== false);

  return (
    <Page wide title={`Hi, ${user.firstName}`} subtitle={`Signed in as ${ROLE_LABELS[user.role]}`} actions={<FullscreenButton />}>
      {/* What needs doing comes first, across the full width. */}
      {next && toDo.length > 0 && (
        <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${toDo.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {toDo.map((entry) => (
            <Link key={entry.label} href={`/plans/${next.id}`} className="card flex items-center gap-4 border-l-2 !border-l-indigo-500 transition hover:border-indigo-500/40">
              <span className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 font-mono text-lg font-semibold tabular-nums ${entry.tone}`}>{entry.count}</span>
              <span className="min-w-0 flex-1 text-sm font-medium">{entry.label}</span>
              <Icon name="chevron" className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
            </Link>
          ))}
        </div>
      )}

      {/* Two columns on a wide screen: your services on the left, the calendar in a fixed column on
          the right. On a phone the calendar comes first. */}
      <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="lg:col-start-2 lg:row-start-1">
          <PersonCalendar personId={user.id} today={today} title="Your calendar" />
        </div>

        <div className="flex flex-col gap-5 sm:gap-6 lg:col-start-1 lg:row-start-1">
          <MySchedule personId={user.id} today={today} />

          <section>
            <h2 className="eyebrow uppercase mb-2.5 px-1">Coming up</h2>
            {upcoming.length === 0 ? (
              <p className="empty">No services planned yet.</p>
            ) : (
              <ul className="list">
                {upcoming.map((plan) => (
                  <li key={plan.id}>
                    <Link
                      href={`/plans/${plan.id}`}
                      aria-label={[plan.title, formatPlanDate(plan.date), plan.serviceType.name, plan.startTime && formatClock(plan.startTime)].filter(Boolean).join(", ")}
                      className="list-row"
                    >
                      <DateTile date={plan.date} />
                      <div className="min-w-0 flex-1">
                        {/* The date is on the tile, so an untitled plan goes by its kind of service. */}
                        <div className="truncate font-medium">{plan.title ?? plan.serviceType.name}</div>
                        <div className="muted truncate text-sm">
                          {[plan.title && plan.serviceType.name, plan.startTime && formatClock(plan.startTime), `${plan._count.items} ${plan._count.items === 1 ? "song" : "songs"}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <Icon name="chevron" className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Gone once the church is up and running: a few people, and a team with someone on it. */}
      {isPlanner && (peopleCount < 3 || staffedTeams < 1) && (
        <section className="card">
          <h2 className="mb-1 font-semibold">Getting set up</h2>
          <p className="muted mb-3 text-sm">Add your volunteers, put them on teams, then invite them so they can sign in.</p>
          <Link href="/people/new" className="btn btn-primary">
            Add a person
          </Link>
        </section>
      )}
    </Page>
  );
}
