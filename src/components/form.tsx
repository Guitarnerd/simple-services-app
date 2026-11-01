"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export type FormState = { error?: string; ok?: string; link?: string } | undefined;

export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
  confirm,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state?.error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.error}
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="text-sm text-green-700 dark:text-green-400">
        {state.ok}
      </p>
    );
  }
  return null;
}

// A password field with a Show / Hide button inside it.
export function PasswordInput(props: Omit<React.ComponentProps<"input">, "type" | "className">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className="input !pr-16" />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="muted absolute inset-y-0 right-0 cursor-pointer rounded-r-xl px-3 text-xs font-medium hover:text-neutral-900 dark:hover:text-white"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}
