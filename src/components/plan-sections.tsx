"use client";

import { useState } from "react";

type Tab = "order" | "team" | "details";

// The plan page's three sections. On a wide screen the service order sits
// beside the team and the details; on a phone they are tabs, one at a time.
export function PlanSections({ order, team, details }: { order: React.ReactNode; team: React.ReactNode; details?: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("order");
  const tabs: [Tab, string][] = [["order", "Order"], ["team", "Team"], ...(details ? ([["details", "Details"]] as [Tab, string][]) : [])];
  const show = (name: Tab) => (tab === name ? "" : "hidden lg:block");

  return (
    <>
      <div role="tablist" aria-label="Plan sections" className="flex rounded-xl bg-black/[0.06] p-1 lg:hidden dark:bg-white/[0.08]">
        {tabs.map(([name, label]) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls={`plan-${name}`}
            onClick={() => setTab(name)}
            className={`min-h-9 flex-1 cursor-pointer rounded-lg text-sm font-medium transition-colors ${
              tab === name ? "bg-surface-raised text-neutral-900 shadow-sm dark:bg-white/15 dark:text-white" : "text-neutral-600 dark:text-neutral-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        <div id="plan-order" className={show("order")}>
          {order}
        </div>
        <div className={`flex-col gap-6 lg:flex ${tab === "order" ? "hidden" : "flex"}`}>
          <div id="plan-team" className={show("team")}>
            {team}
          </div>
          {details && (
            <div id="plan-details" className={show("details")}>
              {details}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
