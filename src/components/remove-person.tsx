"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setArchived } from "@/lib/actions/people";
import { notifyPanes } from "@/components/frame";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/ui";

// Removes someone from the people list. They are archived rather than deleted: hidden from the
// directory and unable to sign in, and one tap on Undo (or "Restore" in the Archived list) brings
// them back with their history. The remove button is not shown on a phone, where it would sit next
// to the contact icons and is too easy to tap by mistake; a person's own page has Archive there.
export function RemovePerson({ personId, name, archived }: { personId: string; name: string; archived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  function change(value: boolean) {
    start(async () => {
      const form = new FormData();
      form.set("personId", personId);
      form.set("archived", String(value));
      await setArchived(form);
      if (value) toast(`Removed ${name}`, { label: "Undo", run: () => change(false) });
      else toast(`Restored ${name}`);
      router.refresh();
      notifyPanes();
    });
  }

  if (archived) {
    return (
      <button type="button" onClick={() => change(false)} disabled={pending} className="btn btn-secondary !min-h-8 !px-3 text-xs">
        Restore
      </button>
    );
  }
  return (
    <button type="button" onClick={() => change(true)} disabled={pending} aria-label={`Remove ${name}`} title="Remove from the list" className="icon-btn hidden hover:!text-red-600 sm:inline-flex">
      <Icon name="trash" className="h-4 w-4" />
    </button>
  );
}
