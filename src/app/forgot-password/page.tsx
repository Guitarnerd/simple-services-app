"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";
import { AuthCard } from "@/components/page";

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(requestPasswordReset, undefined);

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" autoFocus required className="input" />
        </div>
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
        <Link href="/login" className="link text-center text-sm">
          Back to sign in
        </Link>
      </form>
    </AuthCard>
  );
}
