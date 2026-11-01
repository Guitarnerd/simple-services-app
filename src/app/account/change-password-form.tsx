"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePassword, undefined);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <div>
        <label className="label" htmlFor="current">
          Current password
        </label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Type it again
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
          Change password
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
