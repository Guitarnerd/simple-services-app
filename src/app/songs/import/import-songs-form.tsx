"use client";

import { useActionState } from "react";
import { importSongFiles } from "@/lib/actions/songs";
import { FormMessage, SubmitButton } from "@/components/form";

export function ImportSongsForm() {
  const [state, formAction] = useActionState(importSongFiles, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <label className="label" htmlFor="song-files">
          Song files
        </label>
        <input id="song-files" name="file" type="file" multiple required accept=".chordpro,.cho,.crd,.pro,.txt" className="input" />
      </div>
      <SubmitButton className="btn btn-primary w-fit" pendingLabel="Importing…">
        Import songs
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
