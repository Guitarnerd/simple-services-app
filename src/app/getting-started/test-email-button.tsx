"use client";

import { useActionState } from "react";
import { sendSetupTestEmail } from "@/lib/actions/setup";
import { FormMessage, SubmitButton } from "@/components/form";

// Sends to the admin's own address, to prove the settings work before the team relies on them.
export function TestEmailButton() {
  const [state, formAction] = useActionState(sendSetupTestEmail, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <SubmitButton className="btn btn-secondary" pendingLabel="Sending…">
        Send me a test email
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
