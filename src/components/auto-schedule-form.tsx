"use client";

import Link from "next/link";
import { useActionState } from "react";
import { applyAutoSchedule } from "@/lib/actions/schedule";
import { aboutToSchedule } from "@/lib/auto-schedule";
import type { ProposedPlan } from "@/lib/schedule";
import { FormMessage, SubmitButton } from "@/components/form";

// The suggested people, plan by plan, each ticked. Unticking leaves that one out.
export function AutoScheduleForm({ plans }: { plans: ProposedPlan[] }) {
  const [state, formAction] = useActionState(applyAutoSchedule, undefined);
  const shown = plans.filter((plan) => !plan.usesNoPositions);
  const suggested = shown.reduce((sum, plan) => sum + plan.placed.length, 0);

  // Asks about what's ticked at the moment.
  function confirmTicked(event: React.FormEvent<HTMLFormElement>) {
    const picks = new FormData(event.currentTarget).getAll("pick").map(String);
    if (picks.length === 0) return;
    const services = new Set(picks.map((pick) => pick.split(":")[0])).size;
    if (!window.confirm(aboutToSchedule(picks.length, services))) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={confirmTicked} className="flex flex-col gap-4">
      {shown.map((plan) => (
        <section key={plan.id} className="panel">
          <h2 className="panel-head">
            <Link href={`/plans/${plan.id}`} className="hover:underline">
              {plan.heading}
            </Link>
          </h2>
          <div className="panel-body flex flex-col gap-2">
            {plan.placed.length === 0 && plan.open.length === 0 && <p className="muted text-sm">Every spot is filled.</p>}

            {plan.placed.length > 0 && (
              <ul className="flex flex-col gap-1">
                {plan.placed.map((placement) => (
                  <li key={`${placement.personId}:${placement.positionId}`}>
                    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" name="pick" value={`${plan.id}:${placement.positionId}:${placement.personId}`} defaultChecked className="h-4 w-4 shrink-0 accent-indigo-600" />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{placement.personName}</span>
                        <span className="muted">
                          {" "}
                          · {placement.positionName}
                          {placement.with.length > 0 && ` · with ${placement.with.join(", ")}`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {plan.open.map((spot) => (
              <details key={spot.positionName} className="text-sm">
                <summary className="cursor-pointer">
                  <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{spot.count} still open</span> {spot.positionName}
                  {spot.optional && <span className="muted"> (optional)</span>}
                </summary>
                <ul className="muted mt-1 flex flex-col gap-0.5 pl-4 text-xs">
                  {spot.why.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        {suggested > 0 && (
          <SubmitButton pendingLabel="Adding…">
            Add {suggested} {suggested === 1 ? "person" : "people"} to the plans
          </SubmitButton>
        )}
        <FormMessage state={state} />
      </div>
      {suggested > 0 && <p className="muted text-xs">Nobody is emailed yet. After adding, send the requests from Multi View or each plan when you&apos;re ready.</p>}
    </form>
  );
}
