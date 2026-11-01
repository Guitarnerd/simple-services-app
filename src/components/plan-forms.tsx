"use client";

import { useActionState } from "react";
import { createPlan, deleteServiceType, savePlanDetails, saveServiceType } from "@/lib/actions/plans";
import { FormMessage, SubmitButton, type FormState } from "@/components/form";

type ServiceTypeOption = { id: string; name: string };

// With `onCreated` the page stays put and is told about the new plan, rather than
// moving on to it.
export function NewPlanForm({
  serviceTypes,
  defaultDate,
  defaultTypeId,
  onCreated,
  onCancel,
}: {
  serviceTypes: ServiceTypeOption[];
  defaultDate: string;
  defaultTypeId?: string;
  onCreated?: (result: NonNullable<FormState>) => void;
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await createPlan(prev, formData);
    if (result?.ok) onCreated?.(result);
    return result;
  }, undefined);

  return (
    <form action={formAction} className={`flex flex-col gap-3 ${onCreated ? "" : "card"}`}>
      {onCreated && <input type="hidden" name="stay" value="1" />}
      <h2 className="font-semibold">New plan</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="new-plan-type">
            Service
          </label>
          <select id="new-plan-type" name="serviceTypeId" defaultValue={defaultTypeId} required className="input">
            {serviceTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="new-plan-date">
            Date
          </label>
          <input id="new-plan-date" name="date" type="date" defaultValue={defaultDate} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="new-plan-time">
            Start time
          </label>
          <input id="new-plan-time" name="startTime" type="time" className="input" />
          <p className="muted mt-1 text-xs">Leave blank to use the service&apos;s usual time.</p>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="new-plan-title">
          Title <span className="muted font-normal">(optional, e.g. Easter Sunday)</span>
        </label>
        <input id="new-plan-title" name="title" className="input" />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Creating…">Create plan</SubmitButton>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
        )}
        <FormMessage state={state?.error ? state : undefined} />
      </div>
    </form>
  );
}

export function PlanDetailsForm({
  plan,
  serviceTypes,
}: {
  plan: { id: string; serviceTypeId: string; date: string; startTime: string; title: string; notes: string };
  serviceTypes: ServiceTypeOption[];
}) {
  const [state, formAction] = useActionState(savePlanDetails, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="planId" value={plan.id} />
      {/* One column again on a wide screen, where this form sits in the narrow side column. */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
        <div>
          <label className="label" htmlFor="plan-type">
            Service
          </label>
          <select id="plan-type" name="serviceTypeId" defaultValue={plan.serviceTypeId} required className="input">
            {serviceTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="plan-date">
            Date
          </label>
          <input id="plan-date" name="date" type="date" defaultValue={plan.date} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="plan-time">
            Start time
          </label>
          <input id="plan-time" name="startTime" type="time" defaultValue={plan.startTime} className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="plan-title">
          Title <span className="muted font-normal">(optional, e.g. Easter Sunday)</span>
        </label>
        <input id="plan-title" name="title" defaultValue={plan.title} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="plan-notes">
          Notes for the team
        </label>
        <textarea id="plan-notes" name="notes" defaultValue={plan.notes} rows={3} className="input" />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
          Save details
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ServiceTypeForm({ serviceType }: { serviceType?: { id: string; name: string; defaultTime: string } }) {
  const [state, formAction] = useActionState(saveServiceType, undefined);
  const [deleteState, deleteAction] = useActionState(deleteServiceType, undefined);
  const prefix = serviceType?.id ?? "new";

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        {serviceType && <input type="hidden" name="serviceTypeId" value={serviceType.id} />}
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor={`${prefix}-type-name`}>
            {serviceType ? "Name" : "New service type"}
          </label>
          <input id={`${prefix}-type-name`} name="name" defaultValue={serviceType?.name} placeholder="e.g. Sunday Morning" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`${prefix}-type-time`}>
            Usual start time
          </label>
          <input id={`${prefix}-type-time`} name="defaultTime" type="time" defaultValue={serviceType?.defaultTime} className="input" />
        </div>
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
          {serviceType ? "Save" : "Add"}
        </SubmitButton>
      </form>
      <FormMessage state={state} />
      {serviceType && (
        <form action={deleteAction} className="flex items-center gap-3">
          <input type="hidden" name="serviceTypeId" value={serviceType.id} />
          <SubmitButton className="muted cursor-pointer text-sm hover:text-red-600" confirm={`Delete the ${serviceType.name} service type?`}>
            Delete
          </SubmitButton>
          <FormMessage state={deleteState} />
        </form>
      )}
    </div>
  );
}
