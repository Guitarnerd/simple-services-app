"use client";

import { useState } from "react";
import { PERSON_MIME } from "@/components/frame";
import { useDropPerson } from "@/components/drop-person";

// A position's section on a team's own page. On a merged screen a person dragged from the People
// pane can be dropped anywhere on it to put them in the position (position-chip.tsx and
// team-card.tsx do the same on the Teams list). `enabled` is whether this viewer may change the
// team; the server checks again either way.
export function PositionDrop({ positionId, enabled, children }: { positionId: string; enabled: boolean; children: React.ReactNode }) {
  const drop = useDropPerson();
  const [over, setOver] = useState(false);

  function accepts(e: React.DragEvent) {
    return enabled && e.dataTransfer.types.includes(PERSON_MIME);
  }

  return (
    <section
      className={`card transition ${over ? "!border-indigo-500 ring-2 ring-indigo-500" : ""}`}
      onDragEnter={(e) => accepts(e) && e.preventDefault()}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={async (e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setOver(false);
        let person: { id: string; name: string };
        try {
          person = JSON.parse(e.dataTransfer.getData(PERSON_MIME));
        } catch {
          return;
        }
        await drop.toPosition(positionId, person);
      }}
    >
      {children}
    </section>
  );
}
