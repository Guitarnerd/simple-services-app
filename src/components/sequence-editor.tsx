"use client";

import { useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HOLD_MS } from "@/lib/drag";

const SECTIONS = ["Intro", "Verse 1", "Verse 2", "Verse 3", "Pre-Chorus", "Chorus", "Chorus 2", "Bridge", "Bridge 2", "Tag", "Ending", "Instrumental", "Vamp"];

// The sequence is stored as one line of text: "Intro, Verse 1, Chorus".
export function parseSequence(text: string) {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

// The same section can appear more than once, so each chip needs its own id.
type Item = { id: number; label: string };

function Chip({ item, onRemove }: { item: Item; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center rounded-full bg-indigo-100 text-sm text-indigo-950 dark:bg-indigo-950 dark:text-indigo-100 ${isDragging ? "relative z-10 shadow-lg" : ""}`}
    >
      <button type="button" aria-label={`Drag to move ${item.label}`} className="cursor-grab touch-manipulation select-none py-1 [-webkit-touch-callout:none] pl-3 pr-1 active:cursor-grabbing" {...attributes} {...listeners}>
        {item.label}
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove ${item.label}`} className="cursor-pointer py-1 pl-1 pr-2.5 opacity-60 hover:text-red-600 hover:opacity-100">
        ✕
      </button>
    </li>
  );
}

// Builds a song's order of sections: press a button to add one, drag the
// chips to reorder them. The result travels in a hidden input called `name`.
export function SequenceEditor({ name, initial, onChange }: { name: string; initial: string; onChange: () => void }) {
  const [items, setItems] = useState<Item[]>(() => parseSequence(initial).map((label, id) => ({ id, label })));
  const [custom, setCustom] = useState("");

  const sensors = useSensors(
    // Not PointerSensor: that also answers touches and would skip the hold.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function update(next: Item[]) {
    setItems(next);
    onChange();
  }

  function add(label: string) {
    // Commas separate the stored sections, so one can't contain a comma.
    const clean = label.replace(/,/g, " ").trim();
    if (clean) update([...items, { id: Math.max(-1, ...items.map((i) => i.id)) + 1, label: clean }]);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) update(arrayMove(items, from, to));
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={items.map((i) => i.label).join(", ")} />

      {items.length === 0 ? (
        <p className="muted text-sm">No sequence yet. Press the sections below in the order the song is played.</p>
      ) : (
        <DndContext id={`sequence-${name}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
            <ol className="flex flex-wrap gap-2">
              {items.map((item) => (
                <Chip key={item.id} item={item} onRemove={() => update(items.filter((i) => i.id !== item.id))} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((section) => (
          <button key={section} type="button" onClick={() => add(section)} className="btn btn-secondary !min-h-8 !px-2.5 !py-0.5 !text-xs">
            + {section}
          </button>
        ))}
      </div>

      <div className="flex max-w-sm gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          // Typing here isn't a change to the song until it's added.
          onInput={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            add(custom);
            setCustom("");
          }}
          placeholder="Something else, e.g. Verse 4, Interlude"
          aria-label="Another section"
          className="input !py-1.5"
        />
        <button
          type="button"
          onClick={() => {
            add(custom);
            setCustom("");
          }}
          className="btn btn-secondary !min-h-9 !py-1"
        >
          Add
        </button>
      </div>
    </div>
  );
}
