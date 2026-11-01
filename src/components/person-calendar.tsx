import { prisma } from "@/lib/prisma";
import { formatClock, toDateInput } from "@/lib/format";
import { ScheduleCalendar, type CalendarEntry } from "@/components/schedule-calendar";

// A calendar of the services one person is scheduled on and the dates they've blocked out. The caller decides
// who may see it: the person themselves, or someone who schedules.
export async function PersonCalendar({ personId, today, title }: { personId: string; today: Date; title: string }) {
  // A few months back, so last month can still be looked at.
  const from = new Date(today);
  from.setUTCMonth(from.getUTCMonth() - 3, 1);

  const assignments = await prisma.assignment.findMany({
    where: { personId, plan: { date: { gte: from } } },
    include: { plan: { include: { serviceType: { select: { name: true } } } } },
  });
  const blackouts = await prisma.blackout.findMany({ where: { personId, endDate: { gte: from } }, orderBy: { startDate: "asc" } });
  assignments.sort((a, b) => a.plan.date.getTime() - b.plan.date.getTime() || (a.plan.startTime ?? "").localeCompare(b.plan.startTime ?? ""));

  // One entry per plan, however many positions the person holds on it.
  const entries = new Map<string, CalendarEntry>();
  for (const { plan, status } of assignments) {
    if (entries.has(plan.id)) continue;
    entries.set(plan.id, {
      date: toDateInput(plan.date),
      planId: plan.id,
      label: [plan.title ?? plan.serviceType.name, plan.startTime && formatClock(plan.startTime)].filter(Boolean).join(", "),
      status,
    });
  }

  return (
    <section className="card">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ScheduleCalendar
        today={toDateInput(today)}
        entries={[...entries.values()]}
        blocked={blackouts.map((blackout) => ({ from: toDateInput(blackout.startDate), to: toDateInput(blackout.endDate), reason: blackout.reason }))}
      />
    </section>
  );
}
