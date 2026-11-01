"use client";

import { useActionState } from "react";
import { addBlackout, addServingPartner, respondFromLink, saveServingPreferences, sendRequests, setAssignmentStatus } from "@/lib/actions/schedule";
import { FormMessage, SubmitButton } from "@/components/form";
import { STATUS_LABELS, STATUS_STYLES, type Status } from "@/lib/status";

// Lets a scheduler record an answer someone gave in person. Saves on change.
export function StatusSelect({ assignmentId, status, personName }: { assignmentId: string; status: Status; personName: string }) {
  return (
    <form action={setAssignmentStatus}>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label={`Answer for ${personName}`}
        className={`cursor-pointer rounded-lg border-0 px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}

export function SendRequestsForm({ planId, notAsked, waiting }: { planId: string; notAsked: number; waiting: number }) {
  const [state, formAction] = useActionState(sendRequests, undefined);
  if (notAsked === 0 && waiting === 0) return null;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="planId" value={planId} />
      <div className="flex flex-wrap gap-2">
        {notAsked > 0 && (
          <button type="submit" name="kind" value="request" className="btn btn-primary">
            Email requests ({notAsked})
          </button>
        )}
        {waiting > 0 && (
          <button type="submit" name="kind" value="reminder" className="btn btn-secondary">
            Remind those waiting ({waiting})
          </button>
        )}
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function BlackoutForm({ personId }: { personId: string }) {
  const [state, formAction] = useActionState(addBlackout, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="personId" value={personId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="blackout-start">
            First day
          </label>
          <input id="blackout-start" name="startDate" type="date" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="blackout-end">
            Last day
          </label>
          <input id="blackout-end" name="endDate" type="date" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="blackout-reason">
            Reason <span className="muted font-normal">(optional)</span>
          </label>
          <input id="blackout-reason" name="reason" placeholder="e.g. Out of town" className="input" />
        </div>
      </div>
      <p className="muted text-xs">Leave the last day blank for a single day.</p>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Adding…">
          Add blackout dates
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

const HOW_OFTEN = [
  { value: "", label: "No limit" },
  { value: "1", label: "Once a month" },
  { value: "2", label: "Twice a month" },
  { value: "3", label: "3 times a month" },
];

const WEEKS = ["1st", "2nd", "3rd", "4th", "5th"];

export function ServingPreferencesForm({ personId, maxPerMonth, weeks }: { personId: string; maxPerMonth: number | null; weeks: number[] }) {
  const [state, formAction] = useActionState(saveServingPreferences, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="personId" value={personId} />
      <div className="max-w-56">
        <label className="label" htmlFor={`how-often-${personId}`}>
          How often
        </label>
        <select id={`how-often-${personId}`} name="maxPerMonth" defaultValue={maxPerMonth ?? ""} className="input">
          {/* A limit set some other way still shows. */}
          {maxPerMonth !== null && maxPerMonth > 3 && <option value={maxPerMonth}>{maxPerMonth} times a month</option>}
          {HOW_OFTEN.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="label">Which weeks of the month</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {WEEKS.map((label, index) => (
            <label key={label} className="flex min-h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="week" value={index + 1} defaultChecked={weeks.includes(index + 1)} className="h-4 w-4 accent-indigo-600" />
              {label}
            </label>
          ))}
        </div>
        <p className="muted mt-1 text-xs">Leave them all unticked for any week. A 5th Sunday only comes in some months.</p>
      </fieldset>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
          Save preferences
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ServingPartnerForm({ personId, people }: { personId: string; people: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(addServingPartner, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="personId" value={personId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`partner-${personId}`}>
            Person
          </label>
          <select id={`partner-${personId}`} name="partnerId" required defaultValue="" className="input">
            <option value="" disabled>
              Choose someone
            </option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`partner-kind-${personId}`}>
            Together
          </label>
          <select id={`partner-kind-${personId}`} name="always" defaultValue="false" className="input">
            <option value="false">Prefer together</option>
            <option value="true">Always together</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Adding…">
          Add partner
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

// The page an email link opens. Answering takes one more press here so that
// mail scanners that open links automatically can't answer for someone.
export function RespondForm({
  assignmentId,
  token,
  suggested,
  current,
}: {
  assignmentId: string;
  token: string;
  suggested: "confirm" | "decline";
  current: Status;
}) {
  const [state, formAction] = useActionState(respondFromLink, undefined);

  if (state?.ok) {
    return (
      <p role="status" className="text-lg font-medium text-green-700 dark:text-green-400">
        {state.ok}
      </p>
    );
  }

  const confirm = (
    <button key="confirm" type="submit" name="answer" value="confirm" className={`btn w-full ${suggested === "confirm" ? "btn-primary" : "btn-secondary"}`}>
      Yes, I can serve
    </button>
  );
  const decline = (
    <button key="decline" type="submit" name="answer" value="decline" className={`btn w-full ${suggested === "decline" ? "btn-primary" : "btn-secondary"}`}>
      No, I can&apos;t make it
    </button>
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="token" value={token} />
      {current !== "PENDING" && (
        <p className="muted text-sm">
          Your current answer: <span className="font-medium">{STATUS_LABELS[current]}</span>. You can change it below.
        </p>
      )}
      {suggested === "decline" && (
        <div>
          <label className="label" htmlFor="reason">
            Anything we should know? <span className="muted font-normal">(optional)</span>
          </label>
          <input id="reason" name="reason" className="input" />
        </div>
      )}
      {suggested === "confirm" ? [confirm, decline] : [decline, confirm]}
      <FormMessage state={state} />
    </form>
  );
}
