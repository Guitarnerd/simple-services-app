"use client";

import { useActionState } from "react";
import { setPasswordWithToken } from "@/lib/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(setPasswordWithToken, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} autoFocus required className="input" />
        <p className="muted mt-1 text-xs">At least 8 characters.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Type it again
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save password and sign in</SubmitButton>
    </form>
  );
}
