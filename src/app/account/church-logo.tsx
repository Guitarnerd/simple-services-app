"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { removeChurchLogo, setChurchLogo } from "@/lib/actions/church";
import { FormMessage, SubmitButton, type FormState } from "@/components/form";
import { ChurchMark } from "@/components/ui";

// Largest side of the stored logo. It shows at 36 pixels, so this is plenty for sharp screens.
const SIZE = 512;

// Shrinks the chosen picture in the browser and sends it as a PNG, so a big file
// from a designer still uploads quickly and the stored copy stays small.
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("unreadable"))), "image/png"));
}

export function ChurchLogoForm({ logoVersion }: { logoVersion: string | null }) {
  const [state, formAction] = useActionState(setChurchLogo, undefined);
  const [readError, setReadError] = useState<FormState>(undefined);
  const [removing, startRemoving] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <ChurchMark logoVersion={logoVersion} className="h-12 w-12" />
        <p className="muted text-sm">{logoVersion ? "Your church's logo." : "No logo yet, so the app's own mark shows."}</p>
      </div>
      <form
        action={async (formData) => {
          setReadError(undefined);
          const file = input.current?.files?.[0];
          if (!file) return setReadError({ error: "Choose a picture first." });
          try {
            formData.set("logo", new File([await shrink(file)], "logo.png", { type: "image/png" }));
          } catch {
            return setReadError({ error: "That file couldn't be read as a picture. Use a PNG, JPEG or WebP." });
          }
          formAction(formData);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Logo picture" className="input !w-auto max-w-full text-sm" />
        <SubmitButton className="btn btn-primary" pendingLabel="Saving…">
          {logoVersion ? "Replace logo" : "Upload logo"}
        </SubmitButton>
        {logoVersion && (
          <button type="button" disabled={removing} onClick={() => startRemoving(() => removeChurchLogo())} className="btn btn-secondary">
            Remove
          </button>
        )}
      </form>
      <FormMessage state={readError ?? state} />
    </div>
  );
}
