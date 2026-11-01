"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { STATUS_LABELS, type Status } from "@/lib/status";

// One service someone is scheduled on. `date` is "YYYY-MM-DD".
export type CalendarEntry = { date: string; planId: string; label: string; status: Status };

// A stretch of dates someone can't serve, first and last day included.
export type BlockedRange = { from: string; to: string; reason: string | null };

// Diagonal stripes: "not available", told apart from the solid colours of an answer.
const BLOCKED = "bg-[repeating-linear-gradient(135deg,rgba(115,115,115,0.32)_0_3px,transparent_3px_7px)] text-neutral-600 dark:text-neutral-300";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const STYLES: Record<Status, string> = {
  CONFIRMED: "bg-green-700 text-white hover:bg-green-800 dark:bg-green-500 dark:text-black",
  PENDING: "bg-amber-300 text-amber-950 hover:bg-amber-400 dark:bg-amber-400",
  DECLINED: "text-red-700 line-through ring-1 ring-inset ring-red-400 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950",
};
// Which answer colours a day with more than one service on it.
const RANK: Status[] = ["CONFIRMED", "PENDING", "DECLINED"];

// A month at a time, with the days someone is scheduled filled in. A filled
// day opens its plan; a day with two services lists them underneath.
export function ScheduleCalendar({ today, entries, blocked = [] }: { today: string; entries: CalendarEntry[]; blocked?: BlockedRange[] }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const [year, monthNumber] = month.split("-").map(Number);

  // Dates are calendar dates, so the sums are done in UTC and never shift a day.
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array<null>(first.getUTCDay()).fill(null), ...Array.from({ length: days }, (_, n) => n + 1)];

  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);

  function shift(by: number) {
    setMonth(new Date(Date.UTC(year, monthNumber - 1 + by, 1)).toISOString().slice(0, 7));
    setPicked(null);
  }

  const spoken = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="icon-btn">
          <Icon name="back" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setMonth(today.slice(0, 7));
            setPicked(null);
          }}
          title="Back to this month"
          aria-live="polite"
          className="cursor-pointer rounded-lg px-2 py-1 text-sm font-semibold hover:bg-black/[0.05] dark:hover:bg-white/10"
        >
          {first.toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" })}
        </button>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="icon-btn">
          <Icon name="chevron" className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {WEEKDAYS.map((day, n) => (
          <div key={n} aria-hidden="true" className="muted pb-1 text-xs font-semibold">
            {day}
          </div>
        ))}
        {cells.map((day, n) => {
          if (day === null) return <div key={n} />;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const services = byDate.get(date) ?? [];
          const isToday = date === today;
          // "YYYY-MM-DD" strings sort like dates, so they can be compared as they are.
          const out = blocked.find((range) => range.from <= date && date <= range.to);
          const outNote = out ? (out.reason ? `Blocked out: ${out.reason}` : "Blocked out") : "";
          const shape = `mx-auto flex h-9 w-9 items-center justify-center rounded-full tabular-nums ${isToday ? "font-bold" : ""}`;

          if (services.length === 0) {
            return (
              <div
                key={n}
                title={outNote || undefined}
                aria-label={out ? `${spoken(date)}: ${outNote}` : undefined}
                aria-current={isToday ? "date" : undefined}
                className={`${shape} ${out ? BLOCKED : ""} ${isToday ? "ring-2 ring-inset ring-indigo-500" : date < today && !out ? "text-neutral-500 dark:text-neutral-500" : ""}`}
              >
                {day}
              </div>
            );
          }

          const status = RANK.find((s) => services.some((service) => service.status === s)) ?? "PENDING";
          const look = `${shape} font-semibold transition-colors ${STYLES[status]} ${isToday ? "outline-2 outline-offset-2 outline-indigo-500" : ""}`;
          const summary = [...services.map((service) => `${service.label} (${STATUS_LABELS[service.status]})`), ...(out ? [outNote] : [])].join("; ");
          // Scheduled on a day they've blocked out: a striped mark on the coloured day.
          const clash = out && <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-white ring-1 ring-neutral-500 dark:bg-neutral-900 ${BLOCKED}`} />;
          return services.length === 1 ? (
            <Link key={n} href={`/plans/${services[0].planId}`} title={summary} aria-label={`${spoken(date)}: ${summary}`} className={`${look} relative`}>
              {day}
              {clash}
            </Link>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => setPicked(picked === date ? null : date)}
              title={summary}
              aria-label={`${spoken(date)}: ${services.length} services${out ? `; ${outNote}` : ""}`}
              aria-expanded={picked === date}
              className={`${look} relative cursor-pointer`}
            >
              {day}
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white dark:bg-white dark:text-black">
                {services.length}
              </span>
              {clash}
            </button>
          );
        })}
      </div>

      {picked && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-black/10 pt-3 text-sm dark:border-white/10">
          {(byDate.get(picked) ?? []).map((service) => (
            <li key={service.planId}>
              <Link href={`/plans/${service.planId}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${service.status === "CONFIRMED" ? "bg-green-600" : service.status === "PENDING" ? "bg-amber-400" : "bg-red-500"}`} />
                <span className="min-w-0 flex-1 truncate">{service.label}</span>
                <Icon name="chevron" className="h-4 w-4 shrink-0 text-neutral-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="muted mx-auto mt-3 grid w-fit grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
        {(["CONFIRMED", "PENDING", "DECLINED"] as Status[]).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${status === "CONFIRMED" ? "bg-green-600" : status === "PENDING" ? "bg-amber-400" : "ring-1 ring-inset ring-red-500"}`} />
            {STATUS_LABELS[status]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ring-1 ring-neutral-400 ${BLOCKED}`} />
          Blocked out
        </span>
      </div>
    </div>
  );
}
