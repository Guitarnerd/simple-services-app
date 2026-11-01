"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormState } from "@/components/form";

type Status = { kind: "idle" | "unsaved" | "saving" | "saved" | "error"; message?: string };

// How long after the last keystroke a form saves itself.
const DELAY_MS = 700;

// Saves a form by itself shortly after it changes, and when focus leaves it.
// Spread `form` onto the <form>, show `status` with <SaveStatus>, and call
// `touch()` after changing a value React controls (a hidden input, say).
export function useAutosave(action: (previous: FormState, formData: FormData) => Promise<FormState>) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Counts edits, so a save that finishes after a newer edit doesn't claim everything is saved.
  const edits = useRef(0);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const form = ref.current;
    if (!form) return;

    const savingEdit = edits.current;
    setStatus({ kind: "saving" });
    try {
      const result = await action(undefined, new FormData(form));
      if (savingEdit !== edits.current) return;
      setStatus(result?.error ? { kind: "error", message: result.error } : { kind: "saved" });
    } catch {
      if (savingEdit === edits.current) setStatus({ kind: "error", message: "Couldn't save. Check your connection." });
    }
  }, [action]);

  const touch = useCallback(() => {
    edits.current++;
    setStatus({ kind: "unsaved" });
    clearTimeout(timer.current);
    timer.current = setTimeout(save, DELAY_MS);
  }, [save]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    status,
    touch,
    form: {
      ref,
      onInput: touch,
      // Leaving a field with a save still waiting (clicking a link, say) saves straight away.
      onBlur: () => {
        if (timer.current) save();
      },
      onSubmit: (event: React.FormEvent) => {
        event.preventDefault();
        save();
      },
    },
  };
}

export function SaveStatus({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  if (status.kind === "error") {
    return (
      <span role="alert" className="text-sm text-red-600 dark:text-red-400">
        Not saved: {status.message}
      </span>
    );
  }
  const text = { unsaved: "Unsaved changes…", saving: "Saving…", saved: "Changes saved ✓" }[status.kind];
  return (
    <span role="status" className={`text-sm ${status.kind === "saved" ? "text-green-700 dark:text-green-400" : "muted"}`}>
      {text}
    </span>
  );
}
