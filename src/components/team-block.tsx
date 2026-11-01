"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";

// One team on a plan's Team panel: a header that folds the team away, so a
// plan with many teams can be scanned a team at a time.
export function TeamBlock({ name, summary, short, children }: { name: string; summary: string; short: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-2 bg-black/[0.04] px-3 py-2 text-left transition-colors hover:bg-black/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.09]"
      >
        <Icon name="chevron" className={`muted h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
        {/* Amber when the team still has spots to fill. */}
        <span className={`shrink-0 text-xs tabular-nums ${short ? "font-medium text-amber-700 dark:text-amber-300" : "muted"}`}>{summary}</span>
      </button>
      {/* Hidden, not removed, so a half-typed form inside survives folding. */}
      <div hidden={!open}>{children}</div>
    </div>
  );
}
