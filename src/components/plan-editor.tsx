"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addPlanItem, deletePlanItem, reorderPlanItems, restorePlanItem, setPlanItemSong, updatePlanItem } from "@/lib/actions/plans";
import { HOLD_MS } from "@/lib/drag";
import { formatClock, formatLength, itemStarts, preServiceRows } from "@/lib/format";
import { PlayButton, usePlayer, type Track } from "@/components/player";
import { Icon } from "@/components/ui";
import { useToast } from "@/components/toast";

// A plan row's background, shared with the service type's template.
export function rowClasses({ isHeader, shaded, isDragging }: { isHeader: boolean; shaded: boolean; isDragging: boolean }) {
  const tone = isDragging
    ? "relative z-10 bg-surface-raised shadow-xl ring-1 ring-indigo-500/40"
    : isHeader
      ? "border-l-2 border-indigo-500 bg-black/[0.05] dark:bg-white/[0.07]"
      : shaded
        ? "bg-black/[0.065] hover:bg-black/[0.09] dark:bg-white/[0.075] dark:hover:bg-white/[0.1]"
        : "bg-black/[0.025] hover:bg-black/[0.05] dark:bg-white/[0.03] dark:hover:bg-white/[0.055]";
  return `group/row rounded-xl transition-colors ${tone} ${isHeader ? "mt-3 first:mt-0" : ""}`;
}

export type EditorItem = {
  id: string;
  type: "SONG" | "ITEM" | "HEADER";
  title: string;
  lengthSeconds: number | null;
  // On a header: everything under it is before the service, timed backwards from the start time.
  preService: boolean;
  // A song played as its tag in this plan.
  tag: boolean;
  notes: string | null;
  key: string | null;
  songId: string | null;
  // The song's page, with a way back to this plan.
  songHref: string | null;
  arrangementId: string | null;
  // The key the arrangement is normally played in, to show when this service differs.
  defaultKey: string | null;
  arrangements: { id: string; name: string }[];
  links: { id: string; label: string; href: string; newTab: boolean }[];
  // The set list opened at this song.
  sheetHref: string | null;
  // Position in the plan's playable tracks, when the song has a recording or video.
  trackIndex: number | null;
};

export type SongOption = { id: string; title: string; author: string | null; key: string | null; meter: string | null };

type Props = {
  planId: string;
  startTime: string | null;
  items: EditorItem[];
  songs: SongOption[];
  tracks: Track[];
  canEdit: boolean;
};

export function PlanEditor({ planId, startTime, items, songs, tracks, canEdit }: Props) {
  const [optimisticItems, setOptimisticItems] = useOptimistic(items);
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  // The empty song slot a song is being chosen for.
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const sensors = useSensors(
    // Not PointerSensor: that also answers touches and would skip the hold.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Seconds from the start of the service to the start of each item; rows set
  // before the service are at their own (negative) time.
  const { starts: offsets, length: totalSeconds } = itemStarts(optimisticItems);
  const early = preServiceRows(optimisticItems);

  function run(action: () => Promise<{ error?: string }>, optimistic?: EditorItem[]) {
    setError(null);
    startTransition(async () => {
      if (optimistic) setOptimisticItems(optimistic);
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = optimisticItems.findIndex((i) => i.id === active.id);
    const to = optimisticItems.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(optimisticItems, from, to);
    run(() => reorderPlanItems(planId, reordered.map((i) => i.id)), reordered);
  }

  // Rows alternate between two shades, starting again under each header.
  const shaded: boolean[] = [];
  let sinceHeader = 0;
  for (const item of optimisticItems) {
    sinceHeader = item.type === "HEADER" ? 0 : sinceHeader + 1;
    shaded.push(sinceHeader % 2 === 0);
  }

  const rows = optimisticItems.map((item, index) => (
    <ItemRow
      key={item.id}
      item={item}
      shaded={shaded[index]}
      tracks={tracks}
      clock={item.type === "HEADER" ? null : startTime ? formatClock(startTime, offsets[index]) : early[index] && offsets[index] < 0 ? `−${formatLength(-offsets[index])}` : null}
      canEdit={canEdit}
      editing={editingId === item.id}
      songs={songs}
      choosing={choosingId === item.id}
      onChoose={() => setChoosingId(choosingId === item.id ? null : item.id)}
      onPick={(songId) => {
        setChoosingId(null);
        run(() => setPlanItemSong(item.id, songId));
      }}
      onEdit={() => setEditingId(item.id)}
      onCancel={() => setEditingId(null)}
      onSave={(input) => {
        setEditingId(null);
        run(() => updatePlanItem(item.id, input));
      }}
      onDelete={() => {
        // On a phone the ✕ is easy to hit while scrolling, so it asks first. Elsewhere
        // it's gone straight away, with a few seconds to change your mind.
        if (window.matchMedia("(max-width: 639px), (pointer: coarse)").matches && !window.confirm(`Remove ${item.title} from this plan?`)) return;
        const { type, title, lengthSeconds, preService, tag, notes, key, songId, arrangementId } = item;
        const afterId = optimisticItems[index - 1]?.id ?? null;
        run(() => deletePlanItem(item.id), optimisticItems.filter((i) => i.id !== item.id));
        toast(`Removed ${title}`, {
          label: "Undo",
          run: () => run(() => restorePlanItem(planId, afterId, { type, title, lengthSeconds, preService, tag, notes, key, songId, arrangementId })),
        });
      }}
    />
  ));

  return (
    <div className="flex flex-col gap-3">
      {optimisticItems.length === 0 ? (
        <p className="empty">This plan is empty.{canEdit && " Add a song, an item or a header below."}</p>
      ) : canEdit ? (
        <DndContext id={`plan-${planId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={optimisticItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-0.5">{rows}</ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="flex flex-col gap-0.5">{rows}</ul>
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

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {canEdit && <AddBar songs={songs} onAdd={(input) => run(() => addPlanItem(planId, input))} />}
    </div>
  );
}

export type SaveInput = { title: string; length: string; preService: boolean; tag: boolean; key: string; notes: string; arrangementId: string };

function ItemRow({
  item,
  shaded,
  tracks,
  clock,
  canEdit,
  editing,
  songs,
  choosing,
  onChoose,
  onPick,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  item: EditorItem;
  shaded: boolean;
  tracks: Track[];
  clock: string | null;
  canEdit: boolean;
  editing: boolean;
  songs: SongOption[];
  choosing: boolean;
  onChoose: () => void;
  onPick: (songId: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (input: SaveInput) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !canEdit });
  const isHeader = item.type === "HEADER";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={rowClasses({ isHeader, shaded, isDragging })}
    >
      <div className={`flex items-start gap-2 px-2 ${isHeader ? "py-1.5" : "py-2.5"}`}>
        {canEdit && (
          <button
            type="button"
            aria-label={`Drag to reorder ${item.title}`}
            // Touches stay with the browser until the hold, so a swipe over the handle still scrolls.
            className="mt-1 cursor-grab touch-manipulation select-none rounded-md [-webkit-touch-callout:none] p-0.5 text-neutral-300 transition-colors hover:text-neutral-600 active:cursor-grabbing dark:text-neutral-600 dark:hover:text-neutral-300"
            {...attributes}
            {...listeners}
          >
            <Icon name="grip" className="h-5 w-5" />
          </button>
        )}

        {!isHeader && (
          <span className="muted mt-1.5 w-16 shrink-0 text-xs leading-tight tabular-nums sm:w-[4.75rem] sm:text-[13px]">
            {clock}
            {/* On a phone the length sits under the start time, leaving the width for the title. */}
            {item.lengthSeconds != null && <span className="block opacity-70 sm:hidden">{formatLength(item.lengthSeconds)}</span>}
          </span>
        )}

        <div className="min-w-0 flex-1">
          {isHeader ? (
            <div className="flex min-h-7 flex-wrap items-center gap-x-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-neutral-800 dark:text-neutral-100">{item.title}</span>
              {/* Everything under this header is timed back from the start. */}
              {item.preService && <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">Before the start time</span>}
            </div>
          ) : (
            <>
              <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 [&>a.icon-btn-accent]:shrink-0">
                {item.type === "SONG" && item.tag && <span className="badge-tag">TAG</span>}
                {item.songId ? (
                  <Link href={item.songHref ?? "/songs"} className="font-medium hover:text-indigo-600 dark:hover:text-indigo-300">
                    {item.title}
                  </Link>
                ) : item.type === "SONG" ? (
                  // An empty song slot from the service type's template.
                  <>
                    <span className="font-medium italic text-neutral-500 dark:text-neutral-400">{item.title}</span>
                    {canEdit && (
                      <button type="button" onClick={onChoose} className="btn btn-secondary !min-h-8 !px-3 !py-1 text-xs">
                        Choose song
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-neutral-700 dark:text-neutral-200">{item.title}</span>
                )}
                {item.key && <span className="badge-key">{item.key}</span>}
                {item.key && item.defaultKey && item.key !== item.defaultKey && (
                  <span className="muted -ml-1 text-xs" title={`This service plays it in ${item.key}. The song is usually in ${item.defaultKey}.`}>
                    from {item.defaultKey}
                  </span>
                )}
                {item.trackIndex !== null && <PlayButton tracks={tracks} index={item.trackIndex} label={`Play ${item.title}`} />}
                {/* A song with nothing to listen to yet: show where the button would be, greyed out. */}
                {item.trackIndex === null && item.songId && (
                  <span
                    title="Nothing to play yet. Add a YouTube link or a recording on the song's page."
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-neutral-300 dark:bg-white/[0.05] dark:text-neutral-600"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                      <path d="M8 5.5v13l11-6.5z" />
                    </svg>
                  </span>
                )}
                {item.sheetHref && (
                  <Link href={item.sheetHref} aria-label={`Song sheet for ${item.title}`} title="Song sheet" className="icon-btn-accent">
                    <Icon name="sheet" className="h-4 w-4" />
                  </Link>
                )}
              </div>
              {(item.links.length > 0 || (item.trackIndex === null && item.songId && canEdit)) && (
                <div className="flex flex-wrap gap-x-3 text-xs">
                  {item.trackIndex === null && item.songId && canEdit && (
                    <Link href={item.songHref ?? "/songs"} className="muted hover:text-indigo-600 hover:underline dark:hover:text-indigo-300">
                      Add a YouTube link or recording
                    </Link>
                  )}
                  {item.links.map((link) => (
                    <a
                      key={link.id}
                      href={link.href}
                      {...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="link"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
          {item.notes && <p className="muted mt-0.5 whitespace-pre-wrap text-sm">{item.notes}</p>}
        </div>

        {!isHeader && <span className="muted mt-1.5 hidden w-11 shrink-0 text-right text-[13px] tabular-nums sm:block">{formatLength(item.lengthSeconds)}</span>}

        {canEdit && !editing && (
          // Always visible on touch screens; on a computer they appear with the pointer.
          <div className="-mr-1 flex shrink-0 gap-0 transition-opacity sm:gap-0.5 md:mr-0 md:gap-1 md:opacity-0 md:focus-within:opacity-100 md:group-hover/row:opacity-100">
            <button type="button" onClick={onEdit} aria-label={`Edit ${item.title}`} title="Edit" className="icon-btn">
              <Icon name="edit" className="h-4 w-4" />
            </button>
            <button type="button" onClick={onDelete} aria-label={`Remove ${item.title}`} title="Remove" className="icon-btn hover:!text-red-600">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {editing && <ItemEditForm item={item} onCancel={onCancel} onSave={onSave} />}
      {choosing && !editing && (
        <div className="pb-3">
          <SongPicker songs={songs} verb="Choose" onPick={onPick} onClose={onChoose} />
        </div>
      )}
    </li>
  );
}

export function ItemEditForm({
  item,
  onCancel,
  onSave,
}: {
  item: Pick<EditorItem, "type" | "title" | "lengthSeconds" | "preService" | "tag" | "key" | "notes" | "songId" | "songHref" | "arrangementId" | "arrangements">;
  onCancel: () => void;
  onSave: (input: SaveInput) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [length, setLength] = useState(formatLength(item.lengthSeconds));
  const [preService, setPreService] = useState(item.preService);
  const [tag, setTag] = useState(item.tag);
  const [key, setKey] = useState(item.key ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [arrangementId, setArrangementId] = useState(item.arrangementId ?? "");

  return (
    <form
      className="mx-2 mb-3 flex flex-col gap-3 rounded-xl border border-black/[0.07] bg-neutral-50 p-4 dark:border-white/[0.08] dark:bg-black/30"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ title, length, preService, tag, key, notes, arrangementId });
      }}
      // Ctrl+Enter (Cmd+Enter on a Mac) saves from any field, including the notes box.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onSave({ title, length, preService, tag, key, notes, arrangementId });
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(item.type !== "SONG" || !item.songId) && (
          <label className="col-span-2 text-sm font-medium">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input mt-1 font-normal" />
          </label>
        )}
        {item.type === "SONG" && (
          <label className="text-sm font-medium">
            Key
            <input value={key} onChange={(e) => setKey(e.target.value)} maxLength={4} placeholder="G" className="input mt-1 font-normal" />
          </label>
        )}
        {item.type !== "HEADER" && (
          <label className="text-sm font-medium">
            Length
            <input value={length} onChange={(e) => setLength(e.target.value)} placeholder="4:30" className="input mt-1 font-normal" />
          </label>
        )}
        {item.type === "SONG" && item.arrangements.length > 1 && (
          <label className="col-span-2 text-sm font-medium">
            Arrangement
            <select value={arrangementId} onChange={(e) => setArrangementId(e.target.value)} className="input mt-1 font-normal">
              {item.arrangements.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {item.type === "HEADER" && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={preService} onChange={(e) => setPreService(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
          <span>
            <span className="font-medium">Pre-service</span>
            <span className="muted block text-xs">Everything under this header, up to the next one, happens before the start time. Its lengths count back from the start, so 10 minutes of pre-service begins 10 minutes early.</span>
          </span>
        </label>
      )}
      {item.type === "SONG" && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={tag} onChange={(e) => setTag(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
          <span>
            <span className="font-medium">Tag</span>
            <span className="muted block text-xs">Play just the song&apos;s tag in this service. Marks it TAG in the plan and set list; the song itself doesn&apos;t change.</span>
          </span>
        </label>
      )}
      <label className="text-sm font-medium">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input mt-1 font-normal" />
      </label>
      <div className="flex gap-2">
        <button type="submit" title="Ctrl+Enter" className="btn btn-primary">
          Save
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Cancel
        </button>
        <span className="muted hidden self-center text-xs sm:inline">Ctrl+Enter saves</span>
        {item.songId && (
          <Link href={item.songHref ?? "/songs"} className="btn btn-secondary ml-auto">
            Edit song details…
          </Link>
        )}
      </div>
      {item.songId && (
        <p className="muted text-xs">The key, length and notes here are for this service only. The song&apos;s name, chart and music are changed on its own page.</p>
      )}
    </form>
  );
}

type AddInput = { type: "SONG"; songId: string } | { type: "ITEM" | "HEADER"; title: string };

type AddMode = "SONG" | "ITEM" | "HEADER" | null;
const ADD_LABELS = { SONG: "Song", ITEM: "Item", HEADER: "Header" } as const;

// The add buttons under the plan, plus a floating "+" on phones so a long
// order doesn't have to be scrolled to the end to add to it.
function AddBar({ songs, onAdd }: { songs: SongOption[]; onAdd: (input: AddInput) => void }) {
  const [mode, setMode] = useState<AddMode>(null);
  const [menu, setMenu] = useState(false);
  const { isOpen: playerOpen } = usePlayer();

  function choose(next: Exclude<AddMode, null>) {
    setMenu(false);
    setMode(next);
    setTimeout(() => document.getElementById("plan-add")?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  }

  return (
    <>
      {/* Room under the plan so the floating "+" never sits on the last row. */}
      <div aria-hidden="true" className="h-20 md:hidden" />
      <div id="plan-add">
        <AddForms songs={songs} onAdd={onAdd} mode={mode} setMode={setMode} />
      </div>
      {!mode && !playerOpen && (
        <div className="fixed bottom-24 right-4 z-20 flex flex-col items-end gap-2 md:hidden print:hidden">
          {menu &&
            (Object.keys(ADD_LABELS) as (keyof typeof ADD_LABELS)[]).map((kind) => (
              <button key={kind} type="button" onClick={() => choose(kind)} className="btn btn-secondary shadow-lg">
                <Icon name="plus" className="h-4 w-4" />
                {ADD_LABELS[kind]}
              </button>
            ))}
          <button
            type="button"
            onClick={() => setMenu(!menu)}
            aria-label="Add to this plan"
            aria-expanded={menu}
            className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 active:scale-95 dark:bg-indigo-500"
          >
            <Icon name="plus" className={`h-6 w-6 transition-transform ${menu ? "rotate-45" : ""}`} />
          </button>
        </div>
      )}
    </>
  );
}

function AddForms({ songs, onAdd, mode, setMode }: { songs: SongOption[]; onAdd: (input: AddInput) => void; mode: AddMode; setMode: (mode: AddMode) => void }) {
  const [title, setTitle] = useState("");

  function close() {
    setMode(null);
    setTitle("");
  }

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2 px-2 pb-1">
        <button type="button" onClick={() => setMode("SONG")} className="btn btn-primary">
          <Icon name="plus" className="h-4 w-4" />
          Song
        </button>
        <button type="button" onClick={() => setMode("ITEM")} className="btn btn-secondary">
          <Icon name="plus" className="h-4 w-4" />
          Item
        </button>
        <button type="button" onClick={() => setMode("HEADER")} className="btn btn-secondary">
          <Icon name="plus" className="h-4 w-4" />
          Header
        </button>
      </div>
    );
  }

  if (mode === "SONG") {
    return <SongPicker songs={songs} verb="Add" onPick={(songId) => onAdd({ type: "SONG", songId })} onClose={close} />;
  }

  return (
    <form
      className="mx-2 flex gap-2 rounded-xl border border-black/[0.07] bg-neutral-50 p-3 dark:border-white/[0.08] dark:bg-black/30"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd({ type: mode, title });
        setTitle("");
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={mode === "HEADER" ? "Header, e.g. Worship" : "Item, e.g. Welcome, Sermon, Offering"}
        aria-label={mode === "HEADER" ? "Header title" : "Item title"}
        autoFocus
        className="input flex-1"
      />
      <button type="submit" className="btn btn-primary">
        Add
      </button>
      <button type="button" onClick={close} className="btn btn-secondary">
        Done
      </button>
    </form>
  );
}

// Search the song library and pick one.
export function SongPicker({ songs, verb, onPick, onClose }: { songs: SongOption[]; verb: string; onPick: (songId: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? songs.filter((s) => s.title.toLowerCase().includes(q) || s.author?.toLowerCase().includes(q)) : songs;
    return list.slice(0, 30);
  }, [songs, query]);

  return (
    <div className="mx-2 flex flex-col gap-2 rounded-xl border border-black/[0.07] bg-neutral-50 p-3 dark:border-white/[0.08] dark:bg-black/30">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your songs"
          aria-label="Search your songs"
          autoFocus
          className="input flex-1"
        />
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Done
        </button>
      </div>
      {songs.length === 0 ? (
        <p className="muted text-sm">
          Your song library is empty.{" "}
          <Link href="/songs/new" className="link">
            Add a song
          </Link>
        </p>
      ) : matches.length === 0 ? (
        <p className="muted text-sm">No songs match.</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto">
          {matches.map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => onPick(song.id)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-400/10"
              >
                <span className="min-w-0 flex-1 truncate">
                  {song.title}
                  {song.author && <span className="muted"> · {song.author}</span>}
                </span>
                {song.key && <span className="badge-key">{song.key}</span>}
                {song.meter && <span className="badge tabular-nums">{song.meter}</span>}
                <span className="link shrink-0 font-medium">{verb}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
