"use client";

import { useActionState, useState } from "react";
import { createApiToken } from "@/lib/actions/tokens";
import { FormMessage, SubmitButton } from "@/components/form";

// Makes a connection token and shows it once, with the command that connects Claude Code to the app.
export function NewConnectionForm({ appUrl }: { appUrl: string }) {
  const [state, formAction] = useActionState(createApiToken, undefined);
  const [copied, setCopied] = useState(false);
  const token = state?.link;
  const command = token ? `claude mcp add --transport http simple-services ${appUrl}/api/mcp --header "Authorization: Bearer ${token}"` : "";

  if (token) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Run this once in a terminal to connect Claude Code (and the desktop app&apos;s Code tab):</p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-neutral-900 p-3 text-xs text-neutral-100">{command}</pre>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(command).then(() => setCopied(true))}
            className="btn btn-primary"
          >
            {copied ? "Copied" : "Copy command"}
          </button>
          <span className="muted text-xs">This is the only time the token is shown. Anyone with it can act as you, so don&apos;t share it.</span>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label className="label" htmlFor="token-name">
        Name it <span className="muted font-normal">(e.g. My laptop)</span>
      </label>
      <div className="flex gap-2">
        <input id="token-name" name="name" maxLength={60} placeholder="Claude" className="input flex-1" />
        <SubmitButton className="btn btn-secondary" pendingLabel="Creating…">
          New connection
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
