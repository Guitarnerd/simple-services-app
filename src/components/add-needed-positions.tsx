"use client";

import { useActionState, useRef } from "react";
import { savePlanPositions } from "@/lib/actions/plans";
import { FormMessage, SubmitButton, type FormState } from "@/components/form";
import { Modal } from "@/components/modal";
import { PositionFields, type TeamNeeds } from "@/components/service-template";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/ui";

// What this one plan needs. The service type stays as it is.
export function AddNeededPositions({ planId, teams }: { planId: string; teams: TeamNeeds[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await savePlanPositions(prev, formData);
    if (result?.ok) {
      dialog.current?.close();
      toast(result.ok);
    }
    return result;
  }, undefined);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="btn btn-secondary w-fit">
        <Icon name="plus" className="h-4 w-4" />
        Add Needed Positions
      </button>

      <Modal ref={dialog} labelledBy={`needed-${planId}`} wide>
        <form ref={form} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="planId" value={planId} />
          <div>
            <h2 id={`needed-${planId}`} className="text-lg font-semibold">
              Add Needed Positions
            </h2>
            <p className="muted mt-1 text-sm">How many people this service needs in each position. This changes this plan only, not the service type.</p>
          </div>
          <PositionFields teams={teams} />
          <FormMessage state={state?.error ? state : undefined} />
          <div className="flex gap-2">
            <SubmitButton pendingLabel="Saving…">Save positions</SubmitButton>
            <button
              type="button"
              onClick={() => {
                form.current?.reset();
                dialog.current?.close();
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
