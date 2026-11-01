"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { importPlanningCenterPeople, previewPlanningCenter, type PeopleStep } from "@/lib/actions/setup";
import { FormMessage, PasswordInput } from "@/components/form";

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

type Progress = { running: boolean; handled: number; total: number; added: number; updated: number; sharedEmails: number; finished: boolean; error?: string; resume?: PeopleStep };

export function PlanningCenterForm() {
  const [state, formAction, pending] = useActionState(previewPlanningCenter, undefined);
  const preview = state?.preview;
  const form = useRef<HTMLFormElement>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  // Page by page, from here, so a big church can't outlast a web request. The token
  // is read from the boxes each time, and goes no further than this page and the server.
  async function bringPeople() {
    if (!form.current) return;
    const fields = new FormData(form.current);
    const login = { appId: String(fields.get("appId")).trim(), secret: String(fields.get("secret")).trim() };
    let step: PeopleStep | null = progress?.resume ?? { phase: "roster", offset: 0 };
    let tally = { added: progress?.added ?? 0, updated: progress?.updated ?? 0, sharedEmails: progress?.sharedEmails ?? 0 };
    setProgress({ running: true, handled: 0, total: 0, ...tally, finished: false });

    while (step) {
      const current: PeopleStep = step;
      try {
        const result = await importPlanningCenterPeople(login, current);
        if (result.error) throw new Error(result.error);
        tally = { added: tally.added + (result.added ?? 0), updated: tally.updated + (result.updated ?? 0), sharedEmails: tally.sharedEmails + (result.sharedEmails ?? 0) };
        step = result.next ?? null;
        setProgress({ running: Boolean(step), handled: result.handled ?? 0, total: result.total ?? 0, ...tally, finished: !step });
      } catch (error) {
        setProgress({ running: false, handled: 0, total: 0, ...tally, finished: false, error: error instanceof Error ? error.message : "That stopped partway.", resume: current });
        return;
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sent by hand, as a form's `action` would empty the boxes if the token was mistyped. */}
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => formAction(data));
        }}
        className="flex flex-col gap-3"
      >
        <div>
          <label className="label" htmlFor="pco-app-id">
            Application ID
          </label>
          <input id="pco-app-id" name="appId" required autoComplete="off" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="pco-secret">
            Secret
          </label>
          <PasswordInput id="pco-secret" name="secret" required autoComplete="off" />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary w-fit">
          {pending ? "Looking…" : "See what's there"}
        </button>
        <FormMessage state={state?.error ? { error: state.error } : undefined} />
      </form>

      {preview && (
        <div role="status" className="rounded-xl border border-line p-4 text-sm">
          <h3 className="font-semibold">Connected to {preview.church}</h3>
          <ul className="mt-2 flex list-disc flex-col gap-0.5 pl-5">
            <li>{count(preview.people, "person", "people")} in Services</li>
            <li>{count(preview.teams, "team")}</li>
            <li>{count(preview.songs, "song")}</li>
            <li>
              {count(preview.upcomingPlans, "upcoming plan")} and {count(preview.pastPlans, "past plan")}
            </li>
            <li>
              {count(preview.serviceTypes.length, "service type")}
              {preview.serviceTypes.length > 0 && `: ${preview.serviceTypes.join(", ")}`}
            </li>
          </ul>
          <div className="mt-3 flex flex-col gap-2">
            {!progress?.finished && (
              <button type="button" onClick={bringPeople} disabled={progress?.running} className="btn btn-primary w-fit">
                {progress?.running ? "Bringing people across…" : progress?.error ? "Carry on" : `Bring ${count(preview.people, "person", "people")} across`}
              </button>
            )}
            {progress?.running && progress.total > 0 && (
              <p className="muted">
                {progress.handled.toLocaleString("en-US")} of {progress.total.toLocaleString("en-US")} looked at. Keep this page open.
              </p>
            )}
            {progress?.error && <p role="alert" className="text-red-600 dark:text-red-400">{progress.error} Nothing is lost: press Carry on to pick up from here.</p>}
            {progress?.finished && (
              <>
                <p className="font-medium text-green-700 dark:text-green-400">
                  Done. {count(progress.added, "person", "people")} added, and {count(progress.updated, "person", "people")} checked for contact details. Nobody was emailed.
                </p>
                {progress.sharedEmails > 0 && <p className="muted">{progress.sharedEmails === 1 ? "1 person shares" : `${progress.sharedEmails} people share`} an email address with someone else, so came across without one.</p>}
                <Link href="/people" className="link w-fit">
                  Open People
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
