import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { visiblePlans } from "@/lib/schedule";
import { formatClock, formatPlanDate, nextSunday, toDateInput, todayInZone } from "@/lib/format";
import { Page } from "@/components/page";
import { DateTile, Icon } from "@/components/ui";
import { NewPlanForm } from "@/components/plan-forms";

export const metadata: Metadata = { title: "Plans" };

type PlanRow = {
  id: string;
  date: Date;
  startTime: string | null;
  title: string | null;
  serviceType: { name: string };
  items: { title: string }[];
  assignments: { status: string; personId: string }[];
};

const ANSWERS = [
  ["CONFIRMED", "confirmed", "bg-green-500"],
  ["PENDING", "waiting", "bg-amber-500"],
  ["DECLINED", "declined", "bg-red-500"],
] as const;

function PlanList({ plans, showAnswers }: { plans: PlanRow[]; showAnswers: boolean }) {
  return (
    <ul className="list">
      {plans.map((plan) => {
        // Each person counts once, however many positions they hold.
        const count = (status: string) => new Set(plan.assignments.filter((a) => a.status === status).map((a) => a.personId)).size;
        return (
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
                  {[formatPlanDate(plan.date, "short"), plan.title && plan.serviceType.name, plan.startTime && formatClock(plan.startTime)].filter(Boolean).join(" · ")}
                </div>
                <div className="muted truncate text-xs">{plan.items.map((i) => i.title).join(" · ") || "No songs yet"}</div>
              </div>
              {showAnswers && plan.assignments.length > 0 && (
                <div className="hidden shrink-0 items-center gap-3 text-xs sm:flex">
                  {ANSWERS.map(([status, word, dot]) =>
                    count(status) > 0 ? (
                      <span key={status} className="muted inline-flex items-center gap-1.5" title={`${count(status)} ${word}`}>
                        <span className={`h-2 w-2 rounded-full ${dot}`} />
                        {count(status)}
                        {/* Spelled out where there is room; read out everywhere. */}
                        <span className="sr-only lg:not-sr-only">{word}</span>
                      </span>
                    ) : null
                  )}
                </div>
              )}
              <Icon name="chevron" className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// How many past plans "Load past plans" offers to show.
const PAST_CHOICES = [5, 10, 25, 50, 100];

export default async function PlansPage({ searchParams }: PageProps<"/plans">) {
  // Past plans stay out of the way until asked for: ?past=10 shows the last ten.
  const asked = Number((await searchParams).past);
  const pastCount = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 500) : 0;
  const user = await getCurrentUser();
  const isPlanner = hasRole(user.role, "PLANNER");
  const isLeader = hasRole(user.role, "LEADER");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
  const today = todayInZone(org.timezone);
  const include = {
    serviceType: { select: { name: true } },
    items: { where: { type: "SONG" as const }, orderBy: { position: "asc" as const }, select: { title: true } },
    assignments: { select: { status: true, personId: true } },
  };

  const [upcoming, past, pastTotal, serviceTypes] = await Promise.all([
    prisma.plan.findMany({
      where: { ...visiblePlans(user), date: { gte: today } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include,
    }),
    pastCount > 0
      ? prisma.plan.findMany({
          where: { ...visiblePlans(user), date: { lt: today } },
          orderBy: [{ date: "desc" }, { startTime: "desc" }],
          take: pastCount,
          include,
        })
      : [],
    prisma.plan.count({ where: { ...visiblePlans(user), date: { lt: today } } }),
    prisma.serviceType.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <Page
      title="Plans"
      actions={
        <>
          <Link href="/plans/multi-view" className="btn btn-secondary">
            Multi View
          </Link>
          {isPlanner && (
            <Link href="/plans/types" className="btn btn-secondary">
              Service types
            </Link>
          )}
        </>
      }
    >
      <section>
        <h2 className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">Upcoming</h2>
        {upcoming.length === 0 ? <p className="empty">{isLeader ? "Nothing planned yet." : "You aren't scheduled for anything coming up."}</p> : <PlanList plans={upcoming} showAnswers={isLeader} />}
      </section>

      {isPlanner &&
        (serviceTypes.length > 0 ? (
          // Shut until asked for, so the page is mostly the plans themselves.
          <details className="group/new">
            <summary className="btn btn-primary w-fit list-none [&::-webkit-details-marker]:hidden">
              <Icon name="plus" className="h-4 w-4 transition-transform group-open/new:rotate-45" />
              <span className="group-open/new:hidden">Create a new plan</span>
              <span className="hidden group-open/new:inline">Close</span>
            </summary>
            <div className="mt-3">
              <NewPlanForm serviceTypes={serviceTypes} defaultDate={toDateInput(nextSunday(today))} />
            </div>
          </details>
        ) : (
          <p className="empty">
            Before making a plan,{" "}
            <Link href="/plans/types" className="link">
              add a service type
            </Link>{" "}
            such as Sunday Morning.
          </p>
        ))}

      {pastTotal > 0 && (
        <section id="past">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Past
              {past.length > 0 && (
                <span className="ml-2 font-normal normal-case tracking-normal">
                  showing the last {past.length} of {pastTotal}
                </span>
              )}
            </h2>
            {/* A plain form, so it works without scripts: it reloads the page with ?past=N. */}
            <form action="/plans#past" className="flex items-center gap-2">
              <label htmlFor="past-count" className="muted text-sm">
                Show
              </label>
              <select id="past-count" name="past" defaultValue={PAST_CHOICES.includes(pastCount) ? pastCount : 10} aria-label="How many past plans to show" className="input !w-auto !py-1.5">
                {PAST_CHOICES.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
                <option value={500}>All</option>
              </select>
              <button type="submit" className="btn btn-secondary !min-h-9 !py-1">
                {past.length > 0 ? "Update" : "Load past plans"}
              </button>
              {past.length > 0 && (
                <Link href="/plans" className="link text-sm">
                  Hide
                </Link>
              )}
            </form>
          </div>
          {past.length > 0 && <PlanList plans={past} showAnswers={isLeader} />}
        </section>
      )}
    </Page>
  );
}
