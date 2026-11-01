import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { respondFromList } from "@/lib/actions/schedule";
import { describePlanTime, formatClock, formatPlanDate, sortPlanTimes, todayInZone } from "@/lib/format";
import { verifyServiceListLink } from "@/lib/schedule";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/status";
import { AuthCard } from "@/components/page";
import { SubmitButton } from "@/components/form";

export const metadata: Metadata = { title: "Your services" };

// Opened from an email covering several services. No sign-in: the signed link is the
// permission, and it only allows answering this person's services. Answering is a
// press here, so mail scanners that open links can't answer for someone.
export default async function RespondListPage({ params, searchParams }: PageProps<"/respond/person/[id]">) {
  const { id } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";

  const person = verifyServiceListLink(id, token) ? await prisma.person.findUnique({ where: { id }, include: { organization: { select: { name: true, timezone: true } } } }) : null;

  if (!person) {
    return (
      <AuthCard title="This link isn't available" subtitle="It may be incomplete.">
        <p className="muted text-sm">If you think this is a mistake, reply to whoever scheduled you.</p>
      </AuthCard>
    );
  }

  const assignments = await prisma.assignment.findMany({
    where: { personId: id, notifiedAt: { not: null }, plan: { date: { gte: todayInZone(person.organization.timezone) } } },
    include: { position: { include: { team: true } }, plan: { include: { serviceType: true, times: true } } },
    orderBy: [{ plan: { date: "asc" } }, { plan: { startTime: "asc" } }, { position: { sortOrder: "asc" } }],
  });

  // One entry per plan, however many positions the person holds on it.
  const plans = new Map<string, typeof assignments>();
  for (const assignment of assignments) plans.set(assignment.planId, [...(plans.get(assignment.planId) ?? []), assignment]);

  return (
    <AuthCard title={`Hi ${person.firstName}, can you serve?`} subtitle={`${person.organization.name} · Answer each service below.`}>
      {plans.size === 0 ? (
        <p className="muted text-sm">There&apos;s nothing to answer right now.</p>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {[...plans.values()].map((group) => {
            const { plan, status } = group[0];
            return (
              <li key={plan.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{plan.title ?? plan.serviceType.name}</p>
                    <p className="muted text-sm">{[formatPlanDate(plan.date, "short"), plan.title && plan.serviceType.name, plan.startTime && formatClock(plan.startTime)].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
                </div>
                <p className="text-sm">{group.map((a) => `${a.position.team.name}: ${a.position.name}`).join(", ")}</p>
                {plan.times.length > 0 && (
                  <p className="muted text-sm">
                    {sortPlanTimes(plan.times)
                      .map((time) => describePlanTime(plan.date, time))
                      .join(" · ")}
                  </p>
                )}
                {status !== "CONFIRMED" && (
                  <form action={respondFromList}>
                    <input type="hidden" name="personId" value={id} />
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="answer" value="confirm" />
                    <SubmitButton className="btn btn-primary w-full" pendingLabel="Saving…">
                      Yes, I can serve
                    </SubmitButton>
                  </form>
                )}
                {status !== "DECLINED" && (
                  <details>
                    <summary className="muted w-fit cursor-pointer text-sm underline underline-offset-2">No, I can&apos;t make it</summary>
                    <form action={respondFromList} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="personId" value={id} />
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="planId" value={plan.id} />
                      <input type="hidden" name="answer" value="decline" />
                      <input name="reason" maxLength={200} placeholder="Reason (optional)" aria-label="Reason for declining (optional)" className="input" />
                      <SubmitButton className="btn btn-secondary w-full" pendingLabel="Saving…">
                        Decline this service
                      </SubmitButton>
                    </form>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AuthCard>
  );
}
