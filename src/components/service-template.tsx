"use client";

import { useRef, useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { saveTemplateItems, saveTemplatePositions } from "@/lib/actions/plans";
import { HOLD_MS } from "@/lib/drag";
import { formatClock, formatLength, itemStarts, parseLength, preServiceRows } from "@/lib/format";
import { SaveStatus, useAutosave } from "@/components/autosave";
import { rowClasses } from "@/components/plan-editor";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/ui";

type RowType = "SONG" | "ITEM" | "HEADER";
type Row = { id: string; type: RowType; title: string; length: string; preService: boolean; notes: string };

// What a row's length comes to, so far. One still being typed counts as none.
function seconds(row: Row) {
  const length = parseLength(row.length);
  return length === null || Number.isNaN(length) ? null : length;
}

// The rows every new plan of a service type starts with, drawn the way the plan will
// show them. Saves itself: every change sends the whole list.
export function TemplateItemsEditor({ serviceTypeId, startTime, items }: { serviceTypeId: string; startTime: string | null; items: Row[] }) {
  const [rows, setRows] = useState(items);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<"ITEM" | "HEADER" | null>(null);
  const [title, setTitle] = useState("");
  const { status, touch, form } = useAutosave(saveTemplateItems);
  const added = useRef(0);
  const toast = useToast();

  const sensors = useSensors(
    // Not PointerSensor: that also answers touches and would skip the hold.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function change(update: (current: Row[]) => Row[]) {
    setRows(update);
    touch();
  }
  function add(type: RowType, text: string) {
    const id = `new-${++added.current}`;
    change((current) => [...current, { id, type, title: text, length: "", preService: false, notes: "" }]);
  }
  function remove(row: Row, index: number) {
    // As on a plan: on a phone the ✕ asks first, elsewhere it can be undone.
    if (window.matchMedia("(max-width: 639px), (pointer: coarse)").matches && !window.confirm(`Remove ${row.title} from this template?`)) return;
    change((current) => current.filter((r) => r.id !== row.id));
    toast(`Removed ${row.title}`, { label: "Undo", run: () => change((current) => [...current.slice(0, index), row, ...current.slice(index)]) });
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    change((current) => arrayMove(current, current.findIndex((r) => r.id === active.id), current.findIndex((r) => r.id === over.id)));
  }

  const timed = rows.map((row) => ({ type: row.type, lengthSeconds: seconds(row), preService: row.preService }));
  const { starts, length: totalSeconds } = itemStarts(timed);
  const early = preServiceRows(timed);

  // Rows alternate between two shades, starting again under each header.
  const shaded: boolean[] = [];
  let sinceHeader = 0;
  for (const row of rows) {
    sinceHeader = row.type === "HEADER" ? 0 : sinceHeader + 1;
    shaded.push(sinceHeader % 2 === 0);
  }

  return (
    <div onBlur={form.onBlur} className="flex flex-col gap-3">
      <form {...form} onBlur={undefined}>
        <input type="hidden" name="serviceTypeId" value={serviceTypeId} />
        <input type="hidden" name="items" value={JSON.stringify(rows.map(({ type, title, length, preService, notes }) => ({ type, title, length, preService, notes })))} />
      </form>

      {rows.length === 0 ? (
        <p className="empty">Nothing in the template yet. New plans of this type start empty.</p>
      ) : (
        <DndContext id={`template-${serviceTypeId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-0.5">
              {rows.map((row, index) => (
                <TemplateRow
                  key={row.id}
                  row={row}
                  shaded={shaded[index]}
                  clock={row.type === "HEADER" ? null : startTime ? formatClock(startTime, starts[index]) : early[index] && starts[index] < 0 ? `−${formatLength(-starts[index])}` : null}
                  editing={editingId === row.id}
                  onEdit={() => setEditingId(row.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={(patch) => {
                    setEditingId(null);
                    change((current) => current.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
                  }}
                  onRemove={() => remove(row, index)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {totalSeconds > 0 && (
        <p className="muted flex items-center justify-end gap-1.5 border-t border-black/[0.06] px-2 pt-3 text-sm dark:border-white/[0.07]">
          <Icon name="clock" className="h-4 w-4" />
          <span>
            <span className="font-medium text-foreground">{formatLength(totalSeconds)}</span> total
            {startTime && ` · ends about ${formatClock(startTime, totalSeconds)}`}
          </span>
        </p>
      )}

      {adding ? (
        <form
          className="mx-2 flex gap-2 rounded-xl border border-black/[0.07] bg-neutral-50 p-3 dark:border-white/[0.08] dark:bg-black/30"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            add(adding, title.trim());
            setTitle("");
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={adding === "HEADER" ? "Header, e.g. Worship" : "Item, e.g. Welcome, Sermon, Offering"}
            aria-label={adding === "HEADER" ? "Header title" : "Item title"}
            autoFocus
            className="input flex-1"
          />
          <button type="submit" className="btn btn-primary">
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(null);
              setTitle("");
            }}
            className="btn btn-secondary"
          >
            Done
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1">
          <button type="button" onClick={() => add("SONG", `Song ${rows.filter((row) => row.type === "SONG").length + 1}`)} className="btn btn-primary">
            <Icon name="plus" className="h-4 w-4" />
            Song slot
          </button>
          <button type="button" onClick={() => setAdding("ITEM")} className="btn btn-secondary">
            <Icon name="plus" className="h-4 w-4" />
            Item
          </button>
          <button type="button" onClick={() => setAdding("HEADER")} className="btn btn-secondary">
            <Icon name="plus" className="h-4 w-4" />
            Header
          </button>
          <span className="ml-auto">
            <SaveStatus status={status} />
          </span>
        </div>
      )}

      <p className="muted px-2 text-xs">A song slot is a placeholder you pick a song for on the plan. Changing the template doesn&apos;t change plans that already exist.</p>
    </div>
  );
}

function TemplateRow({
  row,
  shaded,
  clock,
  editing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
}: {
  row: Row;
  shaded: boolean;
  clock: string | null;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const isHeader = row.type === "HEADER";
  const length = seconds(row);

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={rowClasses({ isHeader, shaded, isDragging })}>
      <div className={`flex items-start gap-2 px-2 ${isHeader ? "py-1.5" : "py-2.5"}`}>
        <button
          type="button"
          aria-label={`Drag to reorder ${row.title}`}
          // Touches stay with the browser until the hold, so a swipe over the handle still scrolls.
          className="mt-1 cursor-grab touch-manipulation select-none rounded-md [-webkit-touch-callout:none] p-0.5 text-neutral-300 transition-colors hover:text-neutral-600 active:cursor-grabbing dark:text-neutral-600 dark:hover:text-neutral-300"
          {...attributes}
          {...listeners}
        >
          <Icon name="grip" className="h-5 w-5" />
        </button>

        {!isHeader && (
          <span className="muted mt-1.5 w-16 shrink-0 text-xs leading-tight tabular-nums sm:w-[4.75rem] sm:text-[13px]">
            {clock}
            {/* On a phone the length sits under the start time, leaving the width for the title. */}
            {length != null && <span className="block opacity-70 sm:hidden">{formatLength(length)}</span>}
          </span>
        )}

        <div className="min-w-0 flex-1">
          {isHeader ? (
            <div className="flex min-h-7 flex-wrap items-center gap-x-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-neutral-800 dark:text-neutral-100">{row.title}</span>
              {row.preService && <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">Before the start time</span>}
            </div>
          ) : (
            <div className="flex min-h-8 items-center">
              {row.type === "SONG" ? <span className="font-medium italic text-neutral-500 dark:text-neutral-400">{row.title}</span> : <span className="text-neutral-700 dark:text-neutral-200">{row.title}</span>}
            </div>
          )}
          {row.notes && <p className="muted mt-0.5 whitespace-pre-wrap text-sm">{row.notes}</p>}
        </div>

        {!isHeader && <span className="muted mt-1.5 hidden w-11 shrink-0 text-right text-[13px] tabular-nums sm:block">{formatLength(length)}</span>}

        {!editing && (
          // Always visible on touch screens; on a computer they appear with the pointer.
          <div className="-mr-1 flex shrink-0 gap-0 transition-opacity sm:gap-0.5 md:mr-0 md:gap-1 md:opacity-0 md:focus-within:opacity-100 md:group-hover/row:opacity-100">
            <button type="button" onClick={onEdit} aria-label={`Edit ${row.title}`} title="Edit" className="icon-btn">
              <Icon name="edit" className="h-4 w-4" />
            </button>
            <button type="button" onClick={onRemove} aria-label={`Remove ${row.title}`} title="Remove" className="icon-btn hover:!text-red-600">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {editing && <TemplateRowForm row={row} onCancel={onCancel} onSave={onSave} />}
    </li>
  );
}

function TemplateRowForm({ row, onCancel, onSave }: { row: Row; onCancel: () => void; onSave: (patch: Partial<Row>) => void }) {
  const [title, setTitle] = useState(row.title);
  const [length, setLength] = useState(row.length);
  const [preService, setPreService] = useState(row.preService);
  const [notes, setNotes] = useState(row.notes);

  return (
    <form
      className="mx-2 mb-3 flex flex-col gap-3 rounded-xl border border-black/[0.07] bg-neutral-50 p-4 dark:border-white/[0.08] dark:bg-black/30"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onSave({ title: title.trim(), length, preService, notes });
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="col-span-2 text-sm font-medium">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus className="input mt-1 font-normal" />
        </label>
        {row.type !== "HEADER" && (
          <label className="text-sm font-medium">
            Length
            <input value={length} onChange={(e) => setLength(e.target.value)} placeholder="4:30" className="input mt-1 font-normal" />
          </label>
        )}
      </div>
      {row.type === "HEADER" && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={preService} onChange={(e) => setPreService(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
          <span>
            <span className="font-medium">Pre-service</span>
            <span className="muted block text-xs">Everything under this header, up to the next one, happens before the start time. Its lengths count back from the start, so 10 minutes of pre-service begins 10 minutes early.</span>
          </span>
        </label>
      )}
      <label className="text-sm font-medium">
        Description
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input mt-1 font-normal" />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">
          Save
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

export type TeamNeeds = { id: string; name: string; positions: { id: string; name: string; quantity: number; optional: boolean }[] };

// How many people a service type uses in each position, and which are optional. Saves itself.
export function NeededPositionsForm({ serviceTypeId, teams }: { serviceTypeId: string; teams: TeamNeeds[] }) {
  const { status, form } = useAutosave(saveTemplatePositions);

  return (
    <form {...form} className="flex flex-col gap-5">
      <input type="hidden" name="serviceTypeId" value={serviceTypeId} />
      <PositionFields teams={teams} />
      <SaveStatus status={status} />
    </form>
  );
}

// One row per position: how many, and whether it's optional. Blank or 0 means not used.
export function PositionFields({ teams }: { teams: TeamNeeds[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
      {teams.map((team) => (
        <div key={team.id}>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide">{team.name}</h3>
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {team.positions.map((position) => (
              <li key={position.id} className="flex items-center justify-between gap-3 py-1.5">
                <label htmlFor={`need-${position.id}`} className="min-w-0 flex-1 text-sm">
                  {position.name}
                </label>
                <label className="muted flex min-h-9 cursor-pointer items-center gap-1.5 text-xs">
                  <input type="checkbox" name={`optional-${position.id}`} defaultChecked={position.optional} className="h-4 w-4 accent-indigo-600" />
                  Optional
                </label>
                <input
                  id={`need-${position.id}`}
                  name={`need-${position.id}`}
                  type="number"
                  min={0}
                  max={20}
                  inputMode="numeric"
                  defaultValue={position.quantity || ""}
                  placeholder="0"
                  className="input !w-20 !py-1.5 text-center tabular-nums"
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
