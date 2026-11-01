"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addLink, createSong, saveArrangement, saveSong } from "@/lib/actions/songs";
import { FormMessage, SubmitButton, type FormState } from "@/components/form";
import { SaveStatus, useAutosave } from "@/components/autosave";
import { SequenceEditor } from "@/components/sequence-editor";

const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B", "Am", "Bbm", "Bm", "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m"];

export function KeySelect({ name = "key", defaultValue = "", id }: { name?: string; defaultValue?: string; id?: string }) {
  return (
    <select id={id} name={name} defaultValue={defaultValue} className="input">
      <option value="">—</option>
      {/* Keep a key that isn't in the standard list selectable. */}
      {defaultValue && !KEYS.includes(defaultValue) && <option>{defaultValue}</option>}
      <optgroup label="Major">
        {KEYS.filter((key) => !key.endsWith("m")).map((key) => (
          <option key={key}>{key}</option>
        ))}
      </optgroup>
      <optgroup label="Minor">
        {KEYS.filter((key) => key.endsWith("m")).map((key) => (
          <option key={key}>{key}</option>
        ))}
      </optgroup>
    </select>
  );
}

type SongValues = { title: string; author: string; ccliNumber: string; notes: string };
type ArrangementValues = {
  id?: string;
  name: string;
  key: string;
  bpm: string;
  meter: string;
  length: string;
  sequence: string;
  notes: string;
};

function SongFields({ song }: { song: SongValues }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="title">
            Title
          </label>
          <input id="title" name="title" defaultValue={song.title} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="author">
            Authors
          </label>
          <input id="author" name="author" defaultValue={song.author} className="input" />
        </div>
      </div>
      <div className="max-w-xs">
        <label className="label" htmlFor="ccliNumber">
          CCLI song number <span className="muted font-normal">(for the usage report)</span>
        </label>
        <input id="ccliNumber" name="ccliNumber" defaultValue={song.ccliNumber} inputMode="numeric" placeholder="e.g. 22025" className="input" />
        {song.title && (
          <a
            href={song.ccliNumber ? `https://songselect.ccli.com/songs/${encodeURIComponent(song.ccliNumber)}` : `https://songselect.ccli.com/search/results?search=${encodeURIComponent(song.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="link mt-1 inline-block text-sm"
          >
            Find on SongSelect
          </a>
        )}
      </div>
      <div>
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <textarea id="notes" name="notes" defaultValue={song.notes} rows={2} className="input" />
      </div>
    </>
  );
}

function ArrangementFields({ arrangement, prefix }: { arrangement: ArrangementValues; prefix: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor={`${prefix}-key`}>
            Key
          </label>
          <KeySelect id={`${prefix}-key`} defaultValue={arrangement.key} />
        </div>
        <div>
          <label className="label" htmlFor={`${prefix}-bpm`}>
            BPM
          </label>
          <input id={`${prefix}-bpm`} name="bpm" defaultValue={arrangement.bpm} inputMode="numeric" className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`${prefix}-meter`}>
            Time signature
          </label>
          {/* The usual ones are offered, and anything else can be typed. */}
          <input id={`${prefix}-meter`} name="meter" defaultValue={arrangement.meter} placeholder="4/4" list="time-signatures" inputMode="text" maxLength={8} className="input" />
          <datalist id="time-signatures">
            {["4/4", "3/4", "6/8", "2/4", "12/8", "2/2", "9/8", "5/4", "7/8"].map((signature) => (
              <option key={signature} value={signature} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor={`${prefix}-length`}>
            Length
          </label>
          <input id={`${prefix}-length`} name="length" defaultValue={arrangement.length} placeholder="4:30" className="input" />
        </div>
      </div>
    </>
  );
}

const BLANK_ARRANGEMENT: ArrangementValues = { name: "", key: "", bpm: "", meter: "", length: "", sequence: "", notes: "" };

export function NewSongForm() {
  const [state, formAction] = useActionState(createSong, undefined);

  return (
    <form action={formAction} className="card flex flex-col gap-4">
      <SongFields song={{ title: "", author: "", ccliNumber: "", notes: "" }} />
      <ArrangementFields arrangement={BLANK_ARRANGEMENT} prefix="new" />
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Adding…">Add song</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function SongForm({ songId, song }: { songId: string; song: SongValues }) {
  const autosave = useAutosave(saveSong);

  return (
    <form {...autosave.form} className="flex flex-col gap-4">
      <input type="hidden" name="songId" value={songId} />
      <SongFields song={song} />
      <SaveStatus status={autosave.status} />
    </form>
  );
}

// An existing arrangement: saves itself as it is edited.
export function ArrangementEditor({ songId, arrangement }: { songId: string; arrangement: ArrangementValues & { id: string } }) {
  const autosave = useAutosave(saveArrangement);

  return (
    <form {...autosave.form} className="flex flex-col gap-4">
      <input type="hidden" name="songId" value={songId} />
      <input type="hidden" name="arrangementId" value={arrangement.id} />
      <div>
        <label className="label" htmlFor={`${arrangement.id}-name`}>
          Arrangement name
        </label>
        <input id={`${arrangement.id}-name`} name="name" defaultValue={arrangement.name} required className="input" />
      </div>
      <ArrangementFields arrangement={arrangement} prefix={arrangement.id} />
      <div>
        <div className="label">Sequence</div>
        <SequenceEditor name="sequence" initial={arrangement.sequence} onChange={autosave.touch} />
      </div>
      <div>
        <label className="label" htmlFor={`${arrangement.id}-notes`}>
          Arrangement notes
        </label>
        <textarea id={`${arrangement.id}-notes`} name="arrangementNotes" defaultValue={arrangement.notes} rows={2} className="input" />
      </div>
      <SaveStatus status={autosave.status} />
    </form>
  );
}

// A new arrangement, added with a button.
export function ArrangementForm({ songId, arrangement }: { songId: string; arrangement?: ArrangementValues }) {
  const [state, formAction] = useActionState(saveArrangement, undefined);
  const values = arrangement ?? BLANK_ARRANGEMENT;
  const prefix = values.id ?? "add";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="songId" value={songId} />
      {values.id && <input type="hidden" name="arrangementId" value={values.id} />}
      <div>
        <label className="label" htmlFor={`${prefix}-name`}>
          Arrangement name
        </label>
        <input id={`${prefix}-name`} name="name" defaultValue={values.name} placeholder="e.g. Acoustic, Female lead" required className="input" />
      </div>
      <ArrangementFields arrangement={values} prefix={prefix} />
      <div>
        <label className="label" htmlFor={`${prefix}-notes`}>
          Arrangement notes
        </label>
        <textarea id={`${prefix}-notes`} name="arrangementNotes" defaultValue={values.notes} rows={2} className="input" />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
          {values.id ? "Save arrangement" : "Add arrangement"}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

type ArrangementOption = { id: string; name: string };

function ArrangementSelect({ arrangements, id }: { arrangements: ArrangementOption[]; id: string }) {
  if (arrangements.length < 2) return null;
  return (
    <div>
      <label className="label" htmlFor={id}>
        For arrangement
      </label>
      <select id={id} name="arrangementId" defaultValue="" className="input">
        <option value="">All arrangements</option>
        {arrangements.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function UploadForm({ songId, arrangements }: { songId: string; arrangements: ArrangementOption[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<FormState>(undefined);
  const [busy, setBusy] = useState(false);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setState(undefined);
    try {
      const response = await fetch("/api/attachments", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json().catch(() => ({ error: "The upload failed. Try again." }));
      if (result.error) {
        setState({ error: result.error });
      } else {
        setState({ ok: result.count === 1 ? "File uploaded." : `${result.count} files uploaded.` });
        formRef.current?.reset();
        router.refresh();
      }
    } catch {
      setState({ error: "The upload failed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={upload} className="flex flex-col gap-3">
      <input type="hidden" name="songId" value={songId} />
      <div>
        <label className="label" htmlFor="file">
          Upload chord charts, lead sheets or recordings
        </label>
        <input
          id="file"
          name="file"
          type="file"
          multiple
          required
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.mp3,.m4a,.wav,.ogg,.txt,.pro,.cho,.chordpro,.crd,.doc,.docx"
          className="input file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1 file:text-sm dark:file:bg-neutral-800"
        />
        <p className="muted mt-1 text-xs">PDF, image, audio, text or Word files, up to 25 MB each.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="keyLabel">
            Chart key <span className="muted font-normal">(optional)</span>
          </label>
          <KeySelect id="keyLabel" name="keyLabel" />
        </div>
        <ArrangementSelect arrangements={arrangements} id="upload-arrangement" />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn btn-secondary">
          {busy ? "Uploading…" : "Upload"}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function LinkForm({ songId, arrangements }: { songId: string; arrangements: ArrangementOption[] }) {
  const [state, formAction] = useActionState(addLink, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="songId" value={songId} />
      <div>
        <label className="label" htmlFor="url">
          Add a YouTube or other link
        </label>
        <input
          id="url"
          name="url"
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          required
          className="input"
          // Pasting a full address saves it straight away; typing one needs the button.
          onPaste={(event) => {
            const input = event.currentTarget;
            setTimeout(() => {
              if (URL.canParse(input.value.trim()) && /^https?:/i.test(input.value.trim())) input.form?.requestSubmit();
            });
          }}
        />
        <p className="muted mt-1 text-xs">Paste a link and it&apos;s saved straight away.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="link-name">
            Label <span className="muted font-normal">(optional)</span>
          </label>
          <input id="link-name" name="name" placeholder="YouTube" className="input" />
        </div>
        <ArrangementSelect arrangements={arrangements} id="link-arrangement" />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
          Save link
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
