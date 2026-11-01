"use client";

import { useRouter } from "next/navigation";
import { dropPersonOnPosition, removePersonFromPosition } from "@/lib/actions/teams";
import { notifyPanes } from "@/components/frame";
import { useToast } from "@/components/toast";

export type DroppedPerson = { id: string; name: string };

// Putting a person in a position, from a drop on a position chip or on a team card. Whichever way
// it happens the result is the same: a message saying what was done (with Undo when someone was
// added), and every pane on the merged screen reloads.
export function useDropPerson() {
  const router = useRouter();
  const toast = useToast();

  function refreshAll() {
    router.refresh();
    notifyPanes();
  }

  return {
    async toPosition(positionId: string, person: DroppedPerson) {
      const result = await dropPersonOnPosition(positionId, person.id);
      if ("error" in result) {
        toast(result.error);
        return;
      }
      if (result.added) {
        toast(result.ok, {
          label: "Undo",
          run: async () => {
            const form = new FormData();
            form.set("positionId", positionId);
            form.set("personId", person.id);
            await removePersonFromPosition(form);
            refreshAll();
          },
        });
      } else {
        toast(result.ok);
      }
      refreshAll();
    },
  };
}
