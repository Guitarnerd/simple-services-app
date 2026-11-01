"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { applyAutoSchedule, previewAutoSchedule, sendUnaskedRequests, undoAutoSchedule, type AutoScheduleCount } from "@/lib/actions/schedule";
import { aboutToSchedule } from "@/lib/auto-schedule";
import type { UndoableRun } from "@/lib/schedule";
import { FormMessage, SubmitButton, type FormState } from "@/components/form";
import { useToast } from "@/components/toast";
import { Modal } from "@/components/modal";

type Preview = { needed: AutoScheduleCount; all: AutoScheduleCount };

// Asks which positions to fill and says how much that is before anything changes. The
// picks shown are the ones applied, so the number on the dialog is what happens.
export function AutoScheduleButton({ planIds, reviewHref, className = "btn btn-secondary", children }: { planIds: string[]; reviewHref: string; className?: string; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const [fill, setFill] = useState<"needed" | "all">("needed");
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await applyAutoSchedule(prev, formData);
    if (result?.ok) {
      dialog.current?.close();
      toast(result.ok);
    }
    return result;
  }, undefined);

  async function open() {
    setPreview(null);
    setFailed(false);
    setFill("needed");
    dialog.current?.showModal();
    try {
      setPreview(await previewAutoSchedule(planIds));
    } catch {
      setFailed(true);
    }
  }

  const chosen = preview?.[fill];
  const review = `${reviewHref}${fill === "all" ? "&fill=all" : ""}`;

  return (
    <>
      <button type="button" onClick={open} className={className}>
        {children}
      </button>

      <Modal ref={dialog} labelledBy="auto-schedule-title">
        <form action={formAction} className="flex flex-col gap-4">
          <h2 id="auto-schedule-title" className="text-lg font-semibold">
            Auto-schedule
          </h2>

          <fieldset>
            <legend className="label">Which positions should it fill?</legend>
            {(
              [
                ["needed", "Needed positions only"],
                ["all", "Needed and optional positions"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="fill" value={value} checked={fill === value} onChange={() => setFill(value)} className="h-4 w-4 accent-indigo-600" />
                {label}
              </label>
            ))}
          </fieldset>

          <p aria-live="polite" className="text-sm font-medium">
            {failed ? "That couldn't be worked out. Try again." : !chosen ? "Counting open spots…" : chosen.positions > 0 ? aboutToSchedule(chosen.positions, chosen.services) : "There's no one to place in these spots."}
          </p>

          {chosen?.picks.map((pick) => (
            <input key={pick} type="hidden" name="pick" value={pick} />
          ))}
          <FormMessage state={state} />

          <div className="flex flex-wrap items-center gap-2">
            {chosen && chosen.positions > 0 && <SubmitButton pendingLabel="Scheduling…">Auto-schedule</SubmitButton>}
            <button type="button" onClick={() => dialog.current?.close()} className="btn btn-secondary">
              Cancel
            </button>
            {chosen && (
              <Link href={review} className="link ml-auto text-sm">
                {chosen.positions > 0 ? "Review who first" : "See why"}
              </Link>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}

// Stays up until everyone in the run has been asked or taken off, so it's still there
// after leaving the page. The run covers every service in it, not only this one.
export function UndoAutoSchedule({ run }: { run: UndoableRun }) {
  const toast = useToast();
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await undoAutoSchedule(prev, formData);
    if (result?.ok) toast(result.ok);
    return result;
  }, undefined);
  const size = `${run.positions} ${run.positions === 1 ? "position" : "positions"} across ${run.services} ${run.services === 1 ? "service" : "services"}`;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2 text-sm">
      <input type="hidden" name="runId" value={run.id} />
      <span className="min-w-0 flex-1 basis-48">Last auto-schedule: {size}, not emailed yet.</span>
      <SubmitButton className="btn btn-secondary" pendingLabel="Undoing…" confirm={`Take ${size} back off the plans?`}>
        Undo
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

// Everyone not yet asked, on every service in view. Each person gets one email.
export function SendUnaskedForm({ planIds, people, services }: { planIds: string[]; people: number; services: number }) {
  const [state, formAction] = useActionState(sendUnaskedRequests, undefined);
  if (people === 0 && !state) return null;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      {planIds.map((planId) => (
        <input key={planId} type="hidden" name="planId" value={planId} />
      ))}
      {people > 0 && (
        <SubmitButton
          pendingLabel="Sending…"
          confirm={`Email ${people} ${people === 1 ? "person" : "people"} about ${services} ${services === 1 ? "service" : "services"}? Each person gets one email listing all of theirs.`}
        >
          Email unsent requests ({people})
        </SubmitButton>
      )}
      <FormMessage state={state} />
    </form>
  );
}
