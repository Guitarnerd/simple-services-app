"use client";

import { startTransition, useActionState } from "react";
import { createChurch } from "@/lib/actions/setup";
import { FormMessage, PasswordInput } from "@/components/form";

// The zones most churches here will want, ahead of the full list.
const COMMON_ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];

export function SetupForm({ zones, codeSet }: { zones: string[]; codeSet: boolean }) {
  const [state, formAction, pending] = useActionState(createChurch, undefined);

  if (!codeSet) {
    return (
      <p className="text-sm">
        This site needs a setup code first. In Vercel, under Settings → Environment Variables, add <code>SETUP_CODE</code> with a password of your choosing, then redeploy and come back.
      </p>
    );
  }

  return (
    // Sent by hand: a form's `action` empties it afterwards, and one wrong code shouldn't
    // cost someone everything else they typed.
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <label className="label" htmlFor="setup-code">
          Setup code
        </label>
        <PasswordInput id="setup-code" name="code" required autoComplete="off" />
        <p className="muted mt-1 text-xs">The SETUP_CODE you chose in Vercel.</p>
      </div>
      <div>
        <label className="label" htmlFor="setup-church">
          Church name
        </label>
        <input id="setup-church" name="church" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="setup-zone">
          Time zone
        </label>
        <select id="setup-zone" name="timezone" defaultValue="America/Chicago" className="input">
          {COMMON_ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
          <optgroup label="Everywhere">
            {zones
              .filter((zone) => !COMMON_ZONES.includes(zone))
              .map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                </option>
              ))}
          </optgroup>
        </select>
      </div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="setup-first">
            First name
          </label>
          <input id="setup-first" name="firstName" required autoComplete="given-name" className="input" />
        </div>
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="setup-last">
            Last name
          </label>
          <input id="setup-last" name="lastName" required autoComplete="family-name" className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="setup-email">
          Your email
        </label>
        <input id="setup-email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="setup-password">
          Password
        </label>
        <PasswordInput id="setup-password" name="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="setup-confirm">
          Password again
        </label>
        <PasswordInput id="setup-confirm" name="confirm" required minLength={8} autoComplete="new-password" />
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" name="starter" defaultChecked className="mt-0.5 h-4 w-4 accent-indigo-600" />
        <span>
          Start with a Band team, a Tech team and a Sunday Morning service
          <span className="muted block text-xs">Planning Center teams with the same names join these rather than doubling up.</span>
        </span>
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Setting up…" : "Set up my church"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
