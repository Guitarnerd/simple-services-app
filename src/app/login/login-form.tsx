"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
import { FormMessage, PasswordInput, SubmitButton } from "@/components/form";

// `next`: where to go after signing in, such as a Claude approval page.
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(login, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" autoFocus required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      <Link href="/forgot-password" className="link text-center text-sm">
        Forgot your password?
      </Link>
    </form>
  );
}
