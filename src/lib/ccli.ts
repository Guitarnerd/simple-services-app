import "server-only";
import { prisma } from "@/lib/prisma";
import { toDateInput } from "@/lib/format";

export type CcliRow = {
  songId: string;
  title: string;
  author: string | null;
  ccliNumber: string | null;
  // How many services in the period the song was in (twice in one service counts once).
  uses: number;
  // The dates of those services, "YYYY-MM-DD", oldest first.
  dates: string[];
};

// A "YYYY-MM-DD" from a form or the address, as the calendar date it names.
export function readDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Every library song used in a service between two dates (both included),
// most used first. This is what CCLI asks a church to report.
export async function ccliUsage(organizationId: string, from: Date, to: Date): Promise<CcliRow[]> {
  const items = await prisma.planItem.findMany({
    where: { type: "SONG", songId: { not: null }, plan: { organizationId, date: { gte: from, lte: to } } },
    select: { planId: true, plan: { select: { date: true } }, song: { select: { id: true, title: true, author: true, ccliNumber: true } } },
  });

  const rows = new Map<string, CcliRow & { plans: Set<string> }>();
  for (const item of items) {
    if (!item.song) continue;
    const row = rows.get(item.song.id) ?? { songId: item.song.id, title: item.song.title, author: item.song.author, ccliNumber: item.song.ccliNumber, uses: 0, dates: [], plans: new Set<string>() };
    if (!row.plans.has(item.planId)) {
      row.plans.add(item.planId);
      row.dates.push(toDateInput(item.plan.date));
    }
    rows.set(item.song.id, row);
  }

  return [...rows.values()]
    .map(({ plans, ...row }) => ({ ...row, uses: plans.size, dates: row.dates.sort() }))
    .sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}
