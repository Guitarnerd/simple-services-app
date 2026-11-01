"use client";

import { useActionState, useState } from "react";
import { addPlanTime, removePlanTime, updatePlanTime } from "@/lib/actions/plans";
import { addTemplateTime, removeTemplateTime } from "@/lib/actions/plans";
import { FormMessage, SubmitButton, type FormState } from "@/components/form";
import { Icon } from "@/components/ui";

// What people usually need a time for, offered as suggestions.
const SUGGESTIONS = ["Rehearsal", "Arrival", "Setup", "Sound check", "Prayer", "Tear down"];

function Suggestions({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {SUGGESTIONS.map((label) => (
        <option key={label} value={label} />
      ))}
    </datalist>
  );
}

// "TBD": the time goes on the plan now and its day and hour are decided later.
// Ticking it greys out the form's `WHEN` fields; the form must have the `group` class.
// The form is re-made after each add, which unticks it.
const WHEN = "input group-has-[:checked]:pointer-events-none group-has-[:checked]:opacity-40";

function TbdCheckbox({ defaultChecked }: { defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" name="tbd" defaultChecked={defaultChecked} className="h-4 w-4 accent-indigo-600" />
      TBD <span className="muted">(not decided yet)</span>
    </label>
  );
}

function RemoveButton({ label }: { label: string }) {
  return (
    <button type="submit" aria-label={`Remove ${label}`} title="Remove" className="icon-btn hover:!text-red-600">
      <Icon name="close" className="h-4 w-4" />
    </button>
  );
}

type PlanTimeRow = { id: string; text: string; label: string; date: string | null; time: string | null };

// One of a plan's other times, with a pencil that turns it into a small form to change it.
function PlanTimeItem({ time, planDate }: { time: PlanTimeRow; planDate: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await updatePlanTime(prev, formData);
    if (result && "ok" in result) setEditing(false);
    return result;
  }, undefined);

  if (!editing) {
    return (
      <li className="flex items-center gap-2 py-1 text-sm">
        <span className="min-w-0 flex-1">{time.text}</span>
        <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${time.text}`} title="Edit" className="icon-btn">
          <Icon name="edit" className="h-4 w-4" />
        </button>
        <form action={removePlanTime}>
          <input type="hidden" name="timeId" value={time.id} />
          <RemoveButton label={time.text} />
        </form>
      </li>
    );
  }

  return (
    <li className="py-2">
      <form action={formAction} className="group flex flex-col gap-2">
        <input type="hidden" name="timeId" value={time.id} />
        <div className="grid grid-cols-2 gap-2">
          <input name="label" list="plan-time-labels" defaultValue={time.label} aria-label="What the time is for" required maxLength={60} className="input col-span-2" />
          <input name="date" type="date" defaultValue={time.date ?? planDate} aria-label="Date" className={WHEN} />
          <input name="time" type="time" defaultValue={time.time ?? ""} aria-label="Time" className={WHEN} />
        </div>
        <TbdCheckbox defaultChecked={!time.date || !time.time} />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn btn-primary" pendingLabel="Saving…">
            Save
          </SubmitButton>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary">
            Cancel
          </button>
          <FormMessage state={state} />
        </div>
      </form>
    </li>
  );
}

// The other times on a plan (rehearsal, arrival, setup…): what's there, and a form to add one.
export function PlanTimesEditor({ planId, planDate, times }: { planId: string; planDate: string; times: PlanTimeRow[] }) {
  const [state, formAction] = useActionState(addPlanTime, undefined);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">Other times</h3>
        <p className="muted text-xs">Rehearsal, arrival, setup and the like. Everyone on the plan sees these, and they go in schedule emails.</p>
      </div>

      {times.length > 0 && (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {times.map((time) => (
            <PlanTimeItem key={time.id} time={time} planDate={planDate} />
          ))}
        </ul>
      )}

      {/* Keyed by how many there are, so the form clears after one is added. */}
      <form key={times.length} action={formAction} className="group flex flex-col gap-2">
        <input type="hidden" name="planId" value={planId} />
        <div className="grid grid-cols-2 gap-2">
          <input name="label" list="plan-time-labels" placeholder="e.g. Rehearsal" aria-label="What the time is for" required maxLength={60} className="input col-span-2" />
          <Suggestions id="plan-time-labels" />
          <input name="date" type="date" defaultValue={planDate} aria-label="Date" className={WHEN} />
          <input name="time" type="time" aria-label="Time" className={WHEN} />
        </div>
        <TbdCheckbox />
        <div className="flex items-center gap-3">
          <SubmitButton className="btn btn-secondary" pendingLabel="Adding…">
            Add time
          </SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </div>
  );
}

// The times a new plan of a service type starts with.
export function TemplateTimesEditor({ serviceTypeId, times }: { serviceTypeId: string; times: { id: string; text: string }[] }) {
  const [state, formAction] = useActionState(addTemplateTime, undefined);

  return (
    <div className="flex flex-col gap-3">
      {times.length === 0 ? (
        <p className="muted text-sm">None yet.</p>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {times.map((time) => (
            <li key={time.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="min-w-0 flex-1">{time.text}</span>
              <form action={removeTemplateTime}>
                <input type="hidden" name="timeId" value={time.id} />
                <RemoveButton label={time.text} />
              </form>
            </li>
          ))}
        </ul>
      )}

      <form key={times.length} action={formAction} className="group flex flex-wrap items-end gap-2">
        <input type="hidden" name="serviceTypeId" value={serviceTypeId} />
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor="template-time-label">
            What it&apos;s for
          </label>
          <input id="template-time-label" name="label" list="template-time-labels" placeholder="e.g. Rehearsal" required maxLength={60} className="input" />
          <Suggestions id="template-time-labels" />
        </div>
        <div>
          <label className="label" htmlFor="template-time-time">
            Time
          </label>
          <input id="template-time-time" name="time" type="time" className={WHEN} />
        </div>
        <div>
          <label className="label" htmlFor="template-time-days">
            Days before
          </label>
          <input id="template-time-days" name="daysBefore" type="number" min={0} max={14} defaultValue={0} inputMode="numeric" className={`${WHEN} !w-24`} />
        </div>
        <TbdCheckbox />
        <SubmitButton className="btn btn-secondary" pendingLabel="Adding…">
          Add time
        </SubmitButton>
        <FormMessage state={state} />
      </form>
      <p className="muted text-xs">&ldquo;Days before&rdquo; is 0 for the day of the service, 3 for a rehearsal three days earlier.</p>
    </div>
  );
}
