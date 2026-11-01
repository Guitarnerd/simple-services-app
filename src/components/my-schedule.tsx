import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { describePlanTime, formatClock, formatPlanDate, sortPlanTimes } from "@/lib/format";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/status";
import { respond } from "@/lib/actions/schedule";
import { DateTile } from "@/components/ui";

// The signed-in person's upcoming services, with a button to say yes. Saying no is
// rare, so it is a quiet link that opens a place to give a reason.
export async function MySchedule({ personId, today }: { personId: string; today: Date }) {
  const assignments = await prisma.assignment.findMany({
    where: { personId, plan: { date: { gte: today } } },
    include: { position: { include: { team: true } }, plan: { include: { serviceType: true, times: true } } },
    orderBy: [{ plan: { date: "asc" } }, { plan: { startTime: "asc" } }, { position: { sortOrder: "asc" } }],
  });

  // One entry per plan, however many positions the person holds on it.
  const plans = new Map<string, typeof assignments>();
  for (const assignment of assignments) plans.set(assignment.planId, [...(plans.get(assignment.planId) ?? []), assignment]);

  return (
    <section className="card">
      <h2 className="mb-2 font-semibold">Your schedule</h2>
      {plans.size === 0 ? (
        <p className="muted text-sm">You&apos;re not on any upcoming plans yet. When you are, you can answer here.</p>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {[...plans.values()].map((group) => {
            const { plan, status } = group[0];
            return (
              <li key={plan.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center">
                {/* The date, like the name, opens that day's plan. */}
                <Link href={`/plans/${plan.id}`} aria-label={`Open the plan for ${formatPlanDate(plan.date)}`} className="w-fit rounded-xl transition hover:opacity-75">
                  <DateTile date={plan.date} />
                </Link>
                <div className="min-w-48 flex-1">
                  <Link href={`/plans/${plan.id}`} className="group block">
                    <span className="block font-medium group-hover:text-indigo-600 dark:group-hover:text-indigo-300">{plan.title ?? plan.serviceType.name}</span>
                    <span className="muted block text-sm">
                      {[formatPlanDate(plan.date, "short"), plan.title && plan.serviceType.name, plan.startTime && formatClock(plan.startTime)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Link>
                  <div className="text-sm">{group.map((a) => `${a.position.team.name}: ${a.position.name}`).join(", ")}</div>
                  {plan.times.length > 0 && (
                    <div className="muted text-sm">
                      {sortPlanTimes(plan.times)
                        .map((time) => describePlanTime(plan.date, time))
                        .join(" · ")}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
                  {status !== "CONFIRMED" && (
                    <form action={respond}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <button type="submit" name="answer" value="confirm" className="btn btn-primary !min-h-9 !py-1">
                        I can serve
                      </button>
                    </form>
                  )}
                </div>
                {status !== "DECLINED" && (
                  <details className="group/decline sm:basis-full">
                    <summary className="muted w-fit cursor-pointer list-none text-xs underline underline-offset-2 hover:text-neutral-900 sm:ml-auto dark:hover:text-white [&::-webkit-details-marker]:hidden">
                      <span className="group-open/decline:hidden">Need to decline?</span>
                      <span className="hidden group-open/decline:inline">Never mind</span>
                    </summary>
                    <form action={respond} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input type="hidden" name="planId" value={plan.id} />
                      <input name="reason" maxLength={200} placeholder="Reason (optional)" aria-label="Reason for declining (optional)" className="input min-w-0 flex-1" />
                      <button type="submit" name="answer" value="decline" className="btn btn-secondary shrink-0">
                        Decline
                      </button>
                    </form>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
