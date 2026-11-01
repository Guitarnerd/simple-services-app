"use client";

import { useActionState } from "react";
import { saveCcliLicense } from "@/lib/actions/church";
import { FormMessage, SubmitButton } from "@/components/form";

// The number from the church's CCLI licence, kept here to read off when reporting.
export function CcliLicenseForm({ ccliLicense }: { ccliLicense: string }) {
  const [state, formAction] = useActionState(saveCcliLicense, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="ccli-license">
          Your CCLI licence number
        </label>
        <input id="ccli-license" name="ccliLicense" defaultValue={ccliLicense} inputMode="numeric" className="input" />
      </div>
      <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
        Save
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
