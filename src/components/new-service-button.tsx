"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Modal } from "@/components/modal";
import { NewPlanForm } from "@/components/plan-forms";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/ui";

// Adds a service from the matrix, which stays open. A date past the columns showing
// won't get one, so the message has a way to it.
export function NewServiceButton({ serviceTypes, defaultDate, defaultTypeId }: { serviceTypes: { id: string; name: string }[]; defaultDate: string; defaultTypeId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const router = useRouter();

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="btn btn-primary">
        <Icon name="plus" className="h-4 w-4" />
        New service
      </button>
      <Modal ref={dialog} wide>
        <NewPlanForm
          key={defaultDate}
          serviceTypes={serviceTypes}
          defaultDate={defaultDate}
          defaultTypeId={defaultTypeId}
          onCancel={() => dialog.current?.close()}
          onCreated={(result) => {
            dialog.current?.close();
            toast(result.ok ?? "Added.", { label: "Open", run: () => router.push(result.link ?? "/plans") });
          }}
        />
      </Modal>
    </>
  );
}
