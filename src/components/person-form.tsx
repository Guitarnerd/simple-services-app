"use client";

import { useActionState, useState } from "react";
import { savePerson } from "@/lib/actions/people";
import { FormMessage, SubmitButton } from "@/components/form";

export type PersonFormValues = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  birthday: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  notes: string;
  phones: { label: string; number: string; isPrimary: boolean }[];
};

const PHONE_LABELS = ["Mobile", "Home", "Work", "Other"];

function Field({
  name,
  label,
  defaultValue,
  className,
  ...props
}: { name: string; label: string; defaultValue: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} defaultValue={defaultValue} className="input" {...props} />
    </div>
  );
}

export function PersonForm({ person, showNotes }: { person: PersonFormValues; showNotes: boolean }) {
  const [state, formAction] = useActionState(savePerson, undefined);
  const [phones, setPhones] = useState(
    person.phones.length > 0 ? person.phones : [{ label: "Mobile", number: "", isPrimary: true }]
  );
  const primaryIndex = Math.max(0, phones.findIndex((p) => p.isPrimary));

  function updatePhone(index: number, patch: Partial<(typeof phones)[number]>) {
    setPhones(phones.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  return (
    <form action={formAction} className="card flex flex-col gap-4">
      {person.id && <input type="hidden" name="id" value={person.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field name="firstName" label="First name" defaultValue={person.firstName} required autoComplete="off" />
        <Field name="lastName" label="Last name" defaultValue={person.lastName} required autoComplete="off" />
        <Field name="email" label="Email" type="email" defaultValue={person.email} autoComplete="off" />
        <Field name="birthday" label="Birthday" type="date" defaultValue={person.birthday} />
      </div>

      <fieldset>
        <legend className="label">Phone numbers</legend>
        <div className="flex flex-col gap-2">
          {phones.map((phone, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <select
                name="phoneLabel"
                value={phone.label}
                onChange={(e) => updatePhone(index, { label: e.target.value })}
                aria-label="Phone type"
                className="input !w-28"
              >
                {PHONE_LABELS.map((label) => (
                  <option key={label}>{label}</option>
                ))}
              </select>
              <input
                name="phoneNumber"
                type="tel"
                value={phone.number}
                onChange={(e) => updatePhone(index, { number: e.target.value })}
                placeholder="555-123-4567"
                aria-label="Phone number"
                className="input min-w-0 flex-1"
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="phonePrimary"
                  value={index}
                  checked={index === primaryIndex}
                  onChange={() => setPhones(phones.map((p, i) => ({ ...p, isPrimary: i === index })))}
                />
                Primary
              </label>
              <button
                type="button"
                onClick={() => setPhones(phones.filter((_, i) => i !== index))}
                aria-label="Remove phone number"
                className="muted cursor-pointer px-2 text-lg leading-none hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPhones([...phones, { label: "Mobile", number: "", isPrimary: phones.length === 0 }])}
          className="link mt-2 cursor-pointer text-sm"
        >
          + Add a phone number
        </button>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Field name="street" label="Street address" defaultValue={person.street} className="sm:col-span-6" autoComplete="off" />
        <Field name="city" label="City" defaultValue={person.city} className="sm:col-span-3" autoComplete="off" />
        <Field name="state" label="State" defaultValue={person.state} className="sm:col-span-1" autoComplete="off" />
        <Field name="postalCode" label="ZIP" defaultValue={person.postalCode} className="sm:col-span-2" autoComplete="off" />
      </div>

      {showNotes && (
        <div>
          <label className="label" htmlFor="notes">
            Notes <span className="muted font-normal">(only planners and admins see these)</span>
          </label>
          <textarea id="notes" name="notes" defaultValue={person.notes} rows={3} className="input" />
        </div>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">{person.id ? "Save changes" : "Add person"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
