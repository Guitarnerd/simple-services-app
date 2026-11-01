"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addAnotherPosition, arrangePlans, copyPlanItem, copyPlanPosition, deletePlanItem, removePlanPosition, restorePlanItem, setPlanItemSong, setPlanPosition, updatePlanItem } from "@/lib/actions/plans";
import { placeOnPlan, positionCandidates } from "@/lib/actions/schedule";
import { anotherPositionName } from "@/lib/auto-schedule";
import { formatLength } from "@/lib/format";
import { HOLD_MS } from "@/lib/drag";
import { AssignPerson } from "@/components/assign-person";
import { Modal } from "@/components/modal";
import { ItemEditForm, SongPicker, type EditorItem, type SaveInput, type SongOption } from "@/components/plan-editor";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/ui";

export type MatrixItem = { id: string } & Pick<EditorItem, "type" | "title" | "key" | "tag" | "lengthSeconds" | "preService" | "notes" | "songId" | "songHref" | "arrangementId" | "arrangements">;
export type MatrixPlan = {
  id: string;
  day: string;
  title: string;
  subtitle: string;
  items: MatrixItem[];
  team: MatrixPosition[];
};
type MatrixPerson = { assignmentId: string; name: string; status: "PENDING" | "CONFIRMED" | "DECLINED"; asked: boolean };
type MatrixPosition = { positionId: string; position: string; canManage: boolean; open: number; quantity: number; optional: boolean; people: MatrixPerson[] };
// A position someone could be added to, for a column's Add a person.
type AddablePosition = { id: string; name: string; teamName: string };

type Columns = Record<string, MatrixItem[]>;
const DOTS = { CONFIRMED: "bg-green-600", PENDING: "bg-amber-400", DECLINED: "bg-red-500" };

// While a row is held over another service, a stand-in with this id shows where its copy will land.
const COPY = "copy-in-progress";

// A person being carried is told apart from a plan row by this start to their id.
const PERSON = "person:";
// And a position by this: "position:<plan>:<position>".
const POSITION = "position:";

// A person dropped on another service, waiting for Move or Copy.
type Placing = { person: MatrixPerson; position: string; from: MatrixPlan; to: MatrixPlan };

// Several plans side by side, one column each. A row drags up and down its
// own plan to reorder it; dragged across to another plan, it is copied there
// and the original stays put. A person dragged to another plan asks whether to
// move or copy them, in the same position.
export function PlanMatrix({
  plans,
  positions,
  songs,
  canEdit,
  canSchedule,
  canAddPeople,
}: {
  plans: MatrixPlan[];
  positions: AddablePosition[];
  songs: SongOption[];
  canEdit: boolean;
  canSchedule: boolean;
  canAddPeople: boolean;
}) {
  const loaded = () => Object.fromEntries(plans.map((plan) => [plan.id, plan.items])) as Columns;
  const [columns, setColumns] = useState<Columns>(loaded);
  const [active, setActive] = useState<MatrixItem | null>(null);
  const [carried, setCarried] = useState<{ person: MatrixPerson; position: string; from: MatrixPlan } | null>(null);
  const [carriedPosition, setCarriedPosition] = useState<{ entry: MatrixPosition; from: MatrixPlan } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const askDialog = useRef<HTMLDialogElement>(null);
  const [addingAnother, setAddingAnother] = useState<{ entry: MatrixPosition; from: MatrixPlan; to: MatrixPlan } | null>(null);
  const anotherDialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<MatrixItem | null>(null);
  const [choosingSong, setChoosingSong] = useState(false);
  const editDialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  const sensors = useSensors(
    // A mouse picks a row up as soon as it moves. A finger has to rest on the row for a
    // moment first (HOLD_MS); a finger that moves straight away is scrolling, not dragging.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // The column a row (or a column's own drop area) belongs to.
  const columnOf = (id: string, within: Columns) => (id in within ? id : Object.keys(within).find((key) => within[key].some((item) => item.id === id)));
  const copyingTo = Object.keys(columns).find((key) => columns[key].some((item) => item.id === COPY));

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        setColumns(loaded());
      }
    });
  }

  function edit(item: MatrixItem) {
    setEditing(item);
    setChoosingSong(false);
    editDialog.current?.showModal();
  }

  function save(item: MatrixItem, input: SaveInput) {
    editDialog.current?.close();
    run(() => updatePlanItem(item.id, input));
  }

  function changeSong(item: MatrixItem, songId: string) {
    editDialog.current?.close();
    run(() => setPlanItemSong(item.id, songId));
  }

  function remove(planId: string, item: MatrixItem) {
    // As on a plan: on a phone the ✕ asks first, elsewhere it can be undone.
    if (window.matchMedia("(max-width: 639px), (pointer: coarse)").matches && !window.confirm(`Remove ${item.title} from this plan?`)) return;
    const { type, title, lengthSeconds, preService, tag, notes, key, songId, arrangementId } = item;
    const index = columns[planId].findIndex((row) => row.id === item.id);
    const afterId = columns[planId][index - 1]?.id ?? null;
    setColumns({ ...columns, [planId]: columns[planId].filter((row) => row.id !== item.id) });
    run(() => deletePlanItem(item.id));
    toast(`Removed ${title}`, { label: "Undo", run: () => run(() => restorePlanItem(planId, afterId, { type, title, lengthSeconds, preService, tag, notes, key, songId, arrangementId })) });
  }

  function removePosition(plan: MatrixPlan, entry: MatrixPosition) {
    const names = entry.people.map((person) => person.name);
    const message = names.length > 0 ? `Remove ${entry.position} from ${plan.day}? ${names.join(", ")} will come off this service.` : `Remove ${entry.position} from ${plan.day}?`;
    // With people on it that can't simply be undone, so it asks. As with rows, a phone always asks.
    if ((names.length > 0 || window.matchMedia("(max-width: 639px), (pointer: coarse)").matches) && !window.confirm(message)) return;
    run(() => removePlanPosition(plan.id, entry.positionId));
    if (names.length === 0) toast(`Removed ${entry.position}`, { label: "Undo", run: () => run(() => setPlanPosition(plan.id, entry.positionId, entry.quantity, entry.optional)) });
  }

  function findPosition(id: string) {
    for (const plan of plans) {
      const entry = plan.team.find((row) => `${POSITION}${plan.id}:${row.positionId}` === id);
      if (entry) return { entry, from: plan };
    }
    return null;
  }

  // The person an id stands for, and where they are.
  function findPerson(id: string) {
    for (const plan of plans) {
      for (const entry of plan.team) {
        const person = entry.people.find((p) => PERSON + p.assignmentId === id);
        if (person) return { person, position: entry.position, from: plan };
      }
    }
    return null;
  }

  function place(mode: "copy" | "move") {
    if (!placing) return;
    const { person, to } = placing;
    askDialog.current?.close();
    setError(null);
    startTransition(async () => {
      const result = await placeOnPlan(person.assignmentId, to.id, mode);
      if (result.error) setError(`${person.name}: ${result.error}`);
    });
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const overId = String(over.id);
    if (String(active.id).startsWith(PERSON) || String(active.id).startsWith(POSITION)) {
      const to = columnOf(overId, columns) ?? null;
      setDropOn(to === (carried ?? carriedPosition)?.from.id ? null : to);
      return;
    }
    if (overId === COPY) return;
    setColumns((current) => {
      const home = columnOf(String(active.id), current);
      const to = columnOf(overId, current);
      const original = home && current[home].find((item) => item.id === active.id);
      if (!home || !to || !original) return current;

      // Take the stand-in out of wherever it was, then put it where the pointer is now.
      const without = Object.fromEntries(Object.entries(current).map(([key, items]) => [key, items.filter((item) => item.id !== COPY)])) as Columns;
      if (to === home) return Object.values(current).some((items) => items.some((item) => item.id === COPY)) ? without : current;
      const overIndex = without[to].findIndex((item) => item.id === overId);
      const index = overIndex >= 0 ? overIndex : without[to].length;
      if (current[to][index]?.id === COPY) return current;
      return { ...without, [to]: [...without[to].slice(0, index), { ...original, id: COPY }, ...without[to].slice(index)] };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActive(null);
    setError(null);

    // A position dropped on another service: it's copied, as rows are.
    if (String(active.id).startsWith(POSITION)) {
      const to = over ? columnOf(String(over.id), columns) : undefined;
      const target = plans.find((plan) => plan.id === to);
      if (carriedPosition && target && target.id !== carriedPosition.from.id) {
        const { entry, from } = carriedPosition;
        // Already there: ask, rather than quietly doing nothing.
        if (target.team.some((row) => row.positionId === entry.positionId && row.quantity > 0)) {
          setAddingAnother({ entry, from, to: target });
          anotherDialog.current?.showModal();
        } else run(() => copyPlanPosition(from.id, entry.positionId, target.id));
      }
      setCarriedPosition(null);
      setDropOn(null);
      return;
    }

    // A person dropped on another service: ask which they want.
    if (String(active.id).startsWith(PERSON)) {
      const to = plans.find((plan) => plan.id === (over ? columnOf(String(over.id), columns) : undefined));
      if (carried && to && to.id !== carried.from.id) {
        setPlacing({ ...carried, to });
        askDialog.current?.showModal();
      }
      setCarried(null);
      setDropOn(null);
      return;
    }

    // Dropped on another service: copy it there.
    if (copyingTo) {
      const index = columns[copyingTo].findIndex((item) => item.id === COPY);
      startTransition(async () => {
        const result = await copyPlanItem(String(active.id), copyingTo, index);
        if (result.error) setError(result.error);
        // On success the page reloads its plans and this board starts afresh from them.
        if (result.error) setColumns(loaded());
      });
      return;
    }

    // Dropped in its own service: reorder.
    const column = columnOf(String(active.id), columns);
    if (!over || !column || column !== columnOf(String(over.id), columns)) return;
    const from = columns[column].findIndex((item) => item.id === active.id);
    const to = columns[column].findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(columns[column], from, to);
    setColumns({ ...columns, [column]: next });
    startTransition(async () => {
      const result = await arrangePlans([{ planId: column, itemIds: next.map((item) => item.id) }]);
      if (result.error) {
        setError(result.error);
        setColumns(loaded());
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {(canEdit || canSchedule) && (
          <span className="muted">
            {canEdit && "Drag a row up or down to reorder it, or across to another service to copy it there. "}
            {canSchedule && "Drag a person to another service to move or copy them, or a position to copy it. "}
            On a touch screen, hold for a moment to pick up.
          </span>
        )}
        {saving && (
          <span role="status" className="muted">
            Saving…
          </span>
        )}
        {error && (
          <span role="alert" className="text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>

      <DndContext
        id="plan-matrix"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={({ active }) => {
          setActive(Object.values(columns).flat().find((item) => item.id === active.id) ?? null);
          setCarried(findPerson(String(active.id)));
          setCarriedPosition(findPosition(String(active.id)));
          // A small buzz on phones that support it, to say "you've got it".
          if ("vibrate" in navigator) navigator.vibrate(12);
        }}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setCarried(null);
          setCarriedPosition(null);
          setDropOn(null);
          setColumns(loaded());
        }}
      >
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
          {plans.map((plan) => (
            <Column
              key={plan.id}
              plan={plan}
              items={columns[plan.id]}
              canEdit={canEdit}
              positions={positions}
              canAddPeople={canAddPeople}
              copying={Boolean(copyingTo)}
              dropping={dropOn === plan.id}
              onEdit={edit}
              onRemove={(item) => remove(plan.id, item)}
              onRemovePosition={(entry) => removePosition(plan, entry)}
            />
          ))}
        </div>
        <DragOverlay>
          {active && <RowBody item={active} lifted copying={Boolean(copyingTo)} />}
          {carried && <PersonBody person={carried.person} lifted />}
          {carriedPosition && (
            <span className="flex w-fit cursor-grabbing items-center gap-1 rounded-lg bg-surface-raised px-2 py-1 text-xs shadow-xl ring-1 ring-indigo-500/50">
              <Icon name="plus" className="h-3 w-3" />
              {carriedPosition.entry.position}
            </span>
          )}
        </DragOverlay>
      </DndContext>

      {/* Esc closes it as well as the buttons, so it's cleared when it closes. */}
      <Modal ref={editDialog} labelledBy="edit-row-title" wide onClose={() => setEditing(null)}>
        {editing && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="edit-row-title" className="min-w-0 truncate text-lg font-semibold">
                {editing.title}
              </h2>
              {editing.type === "SONG" && !choosingSong && (
                <button type="button" onClick={() => setChoosingSong(true)} className="btn btn-secondary shrink-0">
                  {editing.songId ? "Change song" : "Choose song"}
                </button>
              )}
            </div>
            {choosingSong ? (
              <SongPicker songs={songs} verb="Choose" onPick={(songId) => changeSong(editing, songId)} onClose={() => setChoosingSong(false)} />
            ) : (
              <ItemEditForm key={editing.id} item={editing} onCancel={() => editDialog.current?.close()} onSave={(input) => save(editing, input)} />
            )}
          </div>
        )}
      </Modal>

      <Modal ref={anotherDialog} labelledBy="add-another-title">
        {addingAnother && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 id="add-another-title" className="text-lg font-semibold">
                Add another {addingAnother.entry.position.replace(/\s+\d+$/, "")}?
              </h2>
              <p className="muted mt-1 text-sm">
                {addingAnother.to.day} already has {addingAnother.entry.position}. This adds {anotherPositionName(addingAnother.entry.position, addingAnother.to.team.filter((row) => row.quantity > 0).map((row) => row.position))}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const { entry, from, to } = addingAnother;
                  anotherDialog.current?.close();
                  run(() => addAnotherPosition(from.id, entry.positionId, to.id));
                }}
                className="btn btn-primary"
              >
                Yes
              </button>
              <button type="button" onClick={() => anotherDialog.current?.close()} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal ref={askDialog} labelledBy="place-person-title">
        {placing && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 id="place-person-title" className="text-lg font-semibold">
                Move or copy {placing.person.name}?
              </h2>
              <p className="muted mt-1 text-sm">
                {placing.position}: {placing.from.day} to {placing.to.day}.
              </p>
            </div>
            {placing.person.asked && <p className="text-sm">They&apos;ve already been asked about {placing.from.day}, and moving takes them off it without telling them.</p>}
            <p className="muted text-sm">They&apos;ll show as not asked on {placing.to.day} until requests are sent.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => place("move")} className="btn btn-primary">
                Move
              </button>
              <button type="button" onClick={() => place("copy")} className="btn btn-secondary">
                Copy
              </button>
              <button type="button" onClick={() => askDialog.current?.close()} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Column({
  plan,
  items,
  positions,
  canEdit,
  canAddPeople,
  copying,
  dropping,
  onEdit,
  onRemove,
  onRemovePosition,
}: {
  plan: MatrixPlan;
  items: MatrixItem[];
  positions: AddablePosition[];
  canEdit: boolean;
  canAddPeople: boolean;
  copying: boolean;
  dropping: boolean;
  onEdit: (item: MatrixItem) => void;
  onRemove: (item: MatrixItem) => void;
  onRemovePosition: (entry: MatrixPosition) => void;
}) {
  // The whole column takes a drop, so a row can land in an empty plan or below the last row.
  const { setNodeRef, isOver } = useDroppable({ id: plan.id });
  const total = items.reduce((sum, item) => sum + (item.id === COPY ? 0 : (item.lengthSeconds ?? 0)), 0);

  return (
    <section aria-label={`${plan.title}, ${plan.day}`} className={`panel flex w-72 shrink-0 flex-col ${dropping ? "ring-2 ring-indigo-500/60" : ""}`}>
      <Link href={`/plans/${plan.id}`} className="panel-head !flex-col !items-start !gap-0.5 !px-4 !normal-case !tracking-normal before:!hidden hover:bg-black/[0.05] dark:hover:bg-white/[0.07]">
        <span className="block text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">{plan.day}</span>
        <span className="block max-w-full truncate font-heading text-[15px] text-foreground">{plan.title}</span>
        <span className="block truncate text-xs font-normal text-neutral-500 dark:text-neutral-400">{[plan.subtitle, total > 0 && formatLength(total)].filter(Boolean).join(" · ")}</span>
      </Link>

      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={`flex min-h-24 flex-1 flex-col gap-0.5 p-2 transition-colors ${isOver ? "bg-indigo-50/60 dark:bg-indigo-400/5" : ""}`}>
          {items.map((item) => (
            <Row key={item.id} item={item} canEdit={canEdit} copying={copying} onEdit={() => onEdit(item)} onRemove={() => onRemove(item)} />
          ))}
          {items.length === 0 && <li className="muted px-2 py-6 text-center text-sm">{canEdit ? "Empty. Drag rows here." : "Nothing planned yet."}</li>}
        </ul>
      </SortableContext>

      {plan.team.length > 0 && (
        <dl className="border-t border-black/10 px-2 py-2 text-xs dark:border-white/10">
          {plan.team.map((entry) => (
            <div key={entry.positionId} className="py-0.5">
              <PositionRow plan={plan} entry={entry} canAddPeople={canAddPeople} onRemove={() => onRemovePosition(entry)} />
              {entry.people.map((person) => (
                <dd key={person.assignmentId}>
                  <DraggablePerson plan={plan} entry={entry} person={person} canAddPeople={canAddPeople} />
                </dd>
              ))}
            </div>
          ))}
        </dl>
      )}

      {positions.length > 0 && <AddPersonToService plan={plan} positions={positions} canAddPeople={canAddPeople} />}
    </section>
  );
}

// Buttons on something draggable: presses here are for them, not for picking it up.
const notDragging = { onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(), onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation() };

// Always visible on touch screens; on a computer they float in with the pointer.
const FLOATING = "flex shrink-0 transition-opacity md:absolute md:right-0.5 md:top-0.5 md:rounded-lg md:bg-surface-raised md:opacity-0 md:shadow-sm md:focus-within:opacity-100";

// A position's label: pressing it picks someone, dragging it copies it to another service.
function PositionRow({ plan, entry, canAddPeople, onRemove }: { plan: MatrixPlan; entry: MatrixPosition; canAddPeople: boolean; onRemove: () => void }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: `${POSITION}${plan.id}:${entry.positionId}`, disabled: !entry.canManage });
  const label = (
    <>
      <span className="muted min-w-0 flex-1 truncate">{entry.position}</span>
      {entry.open > 0 && !entry.optional && <span className="shrink-0 rounded-lg bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{entry.open} needed</span>}
      {entry.optional && <span className="muted shrink-0 rounded-lg border border-line px-1.5 py-0.5 font-medium">Optional</span>}
    </>
  );

  if (!entry.canManage) {
    return (
      <dt>
        <div className="flex min-h-7 items-center gap-2 px-2">{label}</div>
      </dt>
    );
  }
  return (
    <dt ref={setNodeRef} className={`group/position relative flex select-none items-center [-webkit-touch-callout:none] touch-manipulation ${isDragging ? "opacity-30" : ""}`} {...listeners}>
      <AssignPerson
        planId={plan.id}
        positionId={entry.positionId}
        positionName={entry.position}
        load={() => positionCandidates(plan.id, entry.positionId)}
        canAddPeople={canAddPeople}
        className="flex min-h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
      >
        {label}
      </AssignPerson>
      <div {...notDragging} className={`${FLOATING} md:group-hover/position:opacity-100`}>
        <button type="button" onClick={onRemove} aria-label={`Remove ${entry.position} from ${plan.day}`} title="Remove" className="icon-btn !h-6 !w-6 hover:!text-red-600">
          <Icon name="close" className="h-3 w-3" />
        </button>
      </div>
    </dt>
  );
}

function DraggablePerson({ plan, entry, person, canAddPeople }: { plan: MatrixPlan; entry: MatrixPosition; person: MatrixPerson; canAddPeople: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: PERSON + person.assignmentId, disabled: !entry.canManage });
  return (
    // As on a plan row: a touch stays with the browser until the hold, so a swipe still scrolls.
    <div
      ref={setNodeRef}
      className={`group/person relative flex items-center select-none [-webkit-touch-callout:none] ${entry.canManage ? "cursor-grab touch-manipulation active:cursor-grabbing" : ""} ${isDragging ? "opacity-30" : ""}`}
      {...attributes}
      {...listeners}
    >
      <div className="min-w-0 flex-1">
        <PersonBody person={person} />
      </div>
      {entry.canManage && (
        <div {...notDragging} className={`${FLOATING} md:group-hover/person:opacity-100`}>
          <AssignPerson
            planId={plan.id}
            positionId={entry.positionId}
            positionName={entry.position}
            load={() => positionCandidates(plan.id, entry.positionId)}
            canAddPeople={canAddPeople}
            replace={person}
            className="icon-btn !h-6 !w-6"
          >
            <Icon name="edit" className="h-3 w-3" />
          </AssignPerson>
        </div>
      )}
    </div>
  );
}

// Any position, needed here or not: pick the position, then the person.
function AddPersonToService({ plan, positions, canAddPeople }: { plan: MatrixPlan; positions: AddablePosition[]; canAddPeople: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const teams = [...new Set(positions.map((position) => position.teamName))];

  return (
    <div className="border-t border-black/10 p-2 dark:border-white/10">
      <button type="button" onClick={() => dialog.current?.showModal()} className="flex min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-400/10">
        <Icon name="plus" className="h-3.5 w-3.5" />
        Add a person
      </button>

      <Modal ref={dialog} labelledBy={`add-person-${plan.id}`}>
        <div className="flex flex-col gap-3">
          <div>
            <h2 id={`add-person-${plan.id}`} className="text-lg font-semibold">
              Add a person
            </h2>
            <p className="muted text-sm">
              {plan.title}, {plan.day}. Which position?
            </p>
          </div>
          {teams.map((team) => (
            <div key={team}>
              <h3 className="muted mb-1 text-xs font-semibold uppercase tracking-wide">{team}</h3>
              {positions
                .filter((position) => position.teamName === team)
                .map((position) => (
                  <AssignPerson
                    key={position.id}
                    planId={plan.id}
                    positionId={position.id}
                    positionName={position.name}
                    load={() => positionCandidates(plan.id, position.id)}
                    canAddPeople={canAddPeople}
                    onDone={() => dialog.current?.close()}
                    className="flex min-h-9 w-full cursor-pointer items-center rounded-lg px-2 text-left text-sm transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-400/10"
                  >
                    {position.name}
                  </AssignPerson>
                ))}
            </div>
          ))}
          <button type="button" onClick={() => dialog.current?.close()} className="btn btn-secondary w-fit">
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}

function PersonBody({ person, lifted = false }: { person: MatrixPerson; lifted?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-lg px-2 py-0.5 ${lifted ? "w-fit cursor-grabbing bg-surface-raised py-1 text-xs shadow-xl ring-1 ring-indigo-500/50" : ""}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[person.status]}`} title={person.status.toLowerCase()} />
      <span className={`truncate ${person.status === "DECLINED" ? "line-through opacity-60" : ""}`}>{person.name}</span>
    </span>
  );
}

function Row({ item, canEdit, copying, onEdit, onRemove }: { item: MatrixItem; canEdit: boolean; copying: boolean; onEdit: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !canEdit });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // No text selection or long-press menu, so holding a finger on the row picks it up.
      // Touches are left to the browser until then, so a swipe over a row still scrolls.
      className={`group/row select-none [-webkit-touch-callout:none] ${canEdit ? "cursor-grab touch-manipulation active:cursor-grabbing" : ""} ${
        // The original fades while it is being moved, but stays solid while a copy is being made.
        isDragging && !copying ? "opacity-30" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <RowBody
        item={item}
        standIn={item.id === COPY}
        actions={
          canEdit &&
          item.id !== COPY && (
            // Presses here are for the buttons, not for picking up the row. Always visible on
            // touch screens; on a computer they float over the row with the pointer, so titles keep the width.
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="-mr-1 flex shrink-0 transition-opacity md:absolute md:right-1.5 md:top-1 md:mr-0 md:rounded-lg md:bg-surface-raised md:opacity-0 md:shadow-sm md:focus-within:opacity-100 md:group-hover/row:opacity-100"
            >
              <button type="button" onClick={onEdit} aria-label={`Edit ${item.title}`} title="Edit" className="icon-btn !h-7 !w-7">
                <Icon name="edit" className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={onRemove} aria-label={`Remove ${item.title}`} title="Remove" className="icon-btn !h-7 !w-7 hover:!text-red-600">
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        }
      />
    </li>
  );
}

function RowBody({ item, lifted = false, copying = false, standIn = false, actions }: { item: MatrixItem; lifted?: boolean; copying?: boolean; standIn?: boolean; actions?: React.ReactNode }) {
  const isHeader = item.type === "HEADER";
  // An empty song slot from the service type's template.
  const placeholder = item.type === "SONG" && !item.songId;
  return (
    <div
      className={`relative rounded-lg px-2.5 text-sm ${
        isHeader ? "bg-neutral-300/80 py-1 dark:bg-white/[0.16]" : "bg-black/[0.035] py-1.5 dark:bg-white/[0.05]"
      } ${lifted ? "w-[17rem] cursor-grabbing !bg-surface-raised shadow-xl ring-1 ring-indigo-500/50" : ""} ${
        standIn ? "opacity-70 outline-2 outline-dashed -outline-offset-2 outline-indigo-500" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {isHeader ? (
          <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.1em]">{item.title}</span>
        ) : (
          <>
            {item.type === "SONG" && <Icon name="songs" className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
            {item.tag && <span className="badge-tag">TAG</span>}
            <span className={`min-w-0 flex-1 truncate ${item.type === "SONG" ? "font-medium" : ""} ${placeholder ? "italic text-neutral-500 dark:text-neutral-400" : ""}`}>{item.title}</span>
            {item.key && <span className="badge-key">{item.key}</span>}
            {item.lengthSeconds != null && <span className="muted shrink-0 text-xs tabular-nums">{formatLength(item.lengthSeconds)}</span>}
          </>
        )}
        {actions}
      </div>
      {item.notes && <p className="muted mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs">{item.notes}</p>}
      {lifted && copying && (
        <span className="absolute -right-2 -top-2 flex items-center gap-0.5 rounded-lg bg-indigo-600 px-1.5 py-0.5 text-[11px] font-bold text-white shadow">
          <Icon name="plus" className="h-3 w-3" />
          Copy
        </span>
      )}
    </div>
  );
}
