"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PERSON_MIME } from "@/components/frame";
import { useDropPerson, type DroppedPerson } from "@/components/drop-person";

// A team on the Teams page. A person dragged from the People pane of a merged screen can be dropped
// anywhere on the card: a team with one position takes them straight away, otherwise a small
// chooser asks which of the team's positions. A drop only ever puts someone in a position that
// already exists; it never makes one. Dropping on a position chip skips the question (see
// position-chip.tsx).
export function TeamCard({ team, positions, children }: { team: { id: string; name: string }; positions: { id: string; name: string }[]; children: React.ReactNode }) {
  const drop = useDropPerson();
  const [over, setOver] = useState(false);
  const [asking, setAsking] = useState<DroppedPerson | null>(null);
  const [busy, setBusy] = useState(false);

  // The chooser closes with Escape.
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAsking(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);

  function accepts(e: React.DragEvent) {
    return e.dataTransfer.types.includes(PERSON_MIME);
  }

  async function onDrop(e: React.DragEvent) {
    if (!accepts(e)) return;
    e.preventDefault();
    setOver(false);
    let person: DroppedPerson;
    try {
      person = JSON.parse(e.dataTransfer.getData(PERSON_MIME));
    } catch {
      return;
    }
    if (positions.length === 1) await drop.toPosition(positions[0].id, person);
    else setAsking(person);
  }

  async function choose(positionId: string, person: DroppedPerson) {
    setBusy(true);
    await drop.toPosition(positionId, person);
    setBusy(false);
    setAsking(null);
  }

  return (
    <div
      className="relative"
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
      onDrop={onDrop}
    >
      <Link href={`/teams/${team.id}`} draggable={false} className={`card flex h-full flex-col gap-3 transition hover:border-indigo-500/40 ${over ? "!border-indigo-500 ring-2 ring-indigo-500" : ""}`}>
        {children}
      </Link>

      {asking && (
        <>
          {/* Clicking anywhere else closes the chooser. */}
          <div className="fixed inset-0 z-10" onClick={() => setAsking(null)} />
          <div role="dialog" aria-label={`Add ${asking.name} to ${team.name}`} className="absolute inset-x-3 top-3 z-20 rounded-xl border border-line bg-surface-raised p-4 shadow-2xl">
            {positions.length > 0 ? (
              <>
                <p className="text-sm font-medium">
                  Add {asking.name} to which {team.name} position?
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {positions.map((p) => (
                    <button key={p.id} type="button" disabled={busy} onClick={() => choose(p.id, asking)} className="btn btn-secondary !min-h-8 !px-3 text-xs">
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm">
                {team.name} has no positions yet, so there is nowhere to put {asking.name}. Add a position to the team first.
              </p>
            )}
            <div className="mt-3 flex items-center gap-4">
              {positions.length === 0 && (
                <Link href={`/teams/${team.id}`} className="btn btn-secondary !min-h-8 !px-3 text-xs">
                  Open {team.name}
                </Link>
              )}
              <button type="button" onClick={() => setAsking(null)} className="muted cursor-pointer text-xs hover:underline">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
