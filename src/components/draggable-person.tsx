"use client";

import { PERSON_MIME, useEmbedded } from "@/components/frame";

// A row in the people list. On a merged screen the whole row can be picked up and dropped on a
// position in the Teams pane (the links inside don't start a drag of their own, see
// `.person-drag` in globals.css); anywhere else it is an ordinary row.
export function DraggablePerson({ id, name, className, children }: { id: string; name: string; className?: string; children: React.ReactNode }) {
  const embedded = useEmbedded();
  return (
    <li
      draggable={embedded}
      className={`${className ?? ""} ${embedded ? "person-drag" : ""}`}
      onDragStart={(e) => {
        if (!embedded) return;
        e.dataTransfer.setData(PERSON_MIME, JSON.stringify({ id, name }));
        e.dataTransfer.setData("text/plain", name);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      {children}
    </li>
  );
}
