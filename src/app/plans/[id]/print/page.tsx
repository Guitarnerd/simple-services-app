import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { visiblePlans } from "@/lib/schedule";
import { abbreviateSequence } from "@/lib/sequence";
import { describePlanTime, formatClock, formatLength, formatPlanDate, itemStarts, preServiceRows, sortPlanTimes } from "@/lib/format";
import { Page } from "@/components/page";
import { PrintedChart } from "@/components/chart-viewer";
import { OrderSheet, PrintButton, type OrderRow } from "@/components/service-print";

export const metadata: Metadata = { title: "Print service" };

// The whole service for paper: the service order on one sheet, then each song's
// sheet in numerals, in the key this service plays it in. Printing it (or saving
// it as a PDF from the print dialog) gives every sheet in order.
export default async function PrintServicePage({ params }: PageProps<"/plans/[id]/print">) {
  const { id } = await params;
  const user = await getCurrentUser();

  const plan = await prisma.plan.findFirst({
    where: { id, ...visiblePlans(user) },
    include: {
      serviceType: true,
      times: true,
      items: { orderBy: { position: "asc" }, include: { song: true, arrangement: true } },
      assignments: {
        where: { status: { not: "DECLINED" } },
        include: { person: true, position: { include: { team: true } } },
      },
    },
  });
  if (!plan) notFound();

  const dateLabel = formatPlanDate(plan.date);
  const { starts, length } = itemStarts(plan.items);
  const early = preServiceRows(plan.items);

  const rows: OrderRow[] = plan.items.map((item, index) =>
    item.type === "HEADER"
      ? { kind: "header", title: item.title, preService: item.preService }
      : {
          kind: "row",
          // Without a start time, pre-service rows say how long before the start they begin.
          time: plan.startTime ? formatClock(plan.startTime, starts[index]) : early[index] && starts[index] < 0 ? `−${formatLength(-starts[index])}` : null,
          title: item.title,
          song: item.type === "SONG",
          placeholder: item.type === "SONG" && !item.songId,
          tag: item.type === "SONG" && item.tag,
          key: item.type === "SONG" ? item.key : null,
          length: formatLength(item.lengthSeconds) || null,
          notes: item.notes,
        }
  );

  // Who is on, team by team and position by position, as the Team panel orders them.
  const slots = new Map<string, { order: [number, string, number, string]; position: string; names: string[] }>();
  for (const a of plan.assignments) {
    const slot = slots.get(a.positionId) ?? {
      order: [a.position.team.sortOrder, a.position.team.name, a.position.sortOrder, a.position.name] as [number, string, number, string],
      position: a.position.name,
      names: [],
    };
    slot.names.push(`${a.person.firstName} ${a.person.lastName}`);
    slots.set(a.positionId, slot);
  }
  const team = [...slots.values()]
    .sort((x, y) => x.order[0] - y.order[0] || x.order[1].localeCompare(y.order[1]) || x.order[2] - y.order[2] || x.order[3].localeCompare(y.order[3]))
    .map(({ position, names }) => ({ position, names }));

  const songs = plan.items.filter((item) => item.type === "SONG" && item.songId);
  const charted = songs.filter((item) => item.arrangement?.chart);
  const missing = songs.filter((item) => !item.arrangement?.chart).map((item) => item.title);

  return (
    <Page
      hideTitleInPrint
      title="Print service"
      subtitle={`${plan.title ?? plan.serviceType.name} · ${dateLabel}`}
      back={{ href: `/plans/${plan.id}`, label: "Plan" }}
      actions={<PrintButton />}
    >
      <p className="muted -mt-2 text-sm print:hidden">
        The service order, then {charted.length} {charted.length === 1 ? "song sheet" : "song sheets"} in numerals, in this service&apos;s keys. To get a PDF, choose
        &ldquo;Save as PDF&rdquo; as the printer.
        {missing.length > 0 && <> Not included, because no song sheet has been typed: {missing.join(", ")}.</>}
      </p>

      <div className="service-print flex flex-col gap-4 rounded-lg bg-neutral-300 p-3 dark:bg-neutral-700 print:block print:bg-transparent print:p-0">
        <OrderSheet
          title={plan.title ?? plan.serviceType.name}
          subtitle={[dateLabel, plan.title && plan.serviceType.name, plan.startTime && formatClock(plan.startTime)].filter(Boolean).join(" · ")}
          times={sortPlanTimes(plan.times).map((time) => describePlanTime(plan.date, time))}
          notes={plan.notes}
          rows={rows}
          team={team}
          total={length > 0 ? `Service length ${formatLength(length)}${plan.startTime ? `, ending about ${formatClock(plan.startTime, length)}` : ""}` : null}
        />
        {charted.map((item) => (
          <PrintedChart
            key={item.id}
            text={item.arrangement!.chart!}
            chartKey={item.arrangement!.chartKey}
            playKey={item.key ?? item.arrangement!.key}
            title={item.tag ? `${item.title} (Tag)` : item.title}
            author={item.song?.author ?? null}
            sequence={abbreviateSequence(item.arrangement!.sequence) || null}
          />
        ))}
      </div>
    </Page>
  );
}
