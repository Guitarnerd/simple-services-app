"use client";

import { useTransition } from "react";
import { removeLink, restoreLink } from "@/lib/actions/songs";
import { useToast } from "@/components/toast";

// Removes a link straight away and offers Undo for a few seconds. (An
// uploaded file can't be brought back, so those ask first instead.)
export function RemoveLinkButton({ attachmentId, name }: { attachmentId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove ${name}`}
      className="muted cursor-pointer text-sm hover:text-red-600 disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          const removed = await removeLink(attachmentId);
          if (removed) toast(`Removed ${name}`, { label: "Undo", run: () => startTransition(() => restoreLink(removed)) });
        })
      }
    >
      Remove
    </button>
  );
}
