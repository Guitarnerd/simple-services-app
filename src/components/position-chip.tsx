"use client";

import { useState } from "react";
import { PERSON_MIME } from "@/components/frame";
import { useDropPerson } from "@/components/drop-person";

// A position on the Teams page, with how many people are in it. A person dragged from the People
// pane of a merged screen can be dropped on it to put them in the position. (Dropping on the rest
// of the team's card asks which position instead; see team-card.tsx.)
export function PositionChip({ id, name, count }: { id: string; name: string; count: number }) {
  const drop = useDropPerson();
  const [over, setOver] = useState(false);
  const empty = count === 0;

  function accepts(e: React.DragEvent) {
    return e.dataTransfer.types.includes(PERSON_MIME);
  }

  async function onDrop(e: React.DragEvent) {
    if (!accepts(e)) return;
    // Handled here, so the card around the chip doesn't ask which position as well.
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    let person: { id: string; name: string };
    try {
      person = JSON.parse(e.dataTransfer.getData(PERSON_MIME));
    } catch {
      return;
    }
    await drop.toPosition(id, person);
  }

  return (
    <span
      onDragEnter={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      // Moving onto the count inside the chip is not leaving the chip.
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
      // How many people can fill each position; an empty one stands out.
      className={`badge gap-1.5 transition ${empty ? "!bg-amber-100 !text-amber-900 dark:!bg-amber-950 dark:!text-amber-200" : ""} ${over ? "!bg-indigo-500/20 ring-2 ring-indigo-500" : ""}`}
    >
      {name}
      <span className="font-semibold tabular-nums" aria-label={`${count} ${count === 1 ? "person" : "people"}`}>
        {count}
      </span>
    </span>
  );
}
