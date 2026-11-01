"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addAssignment, addNewPersonToPlan, swapAssignment } from "@/lib/actions/schedule";
import { FormMessage, SubmitButton } from "@/components/form";
import { Avatar, Icon } from "@/components/ui";

export type Candidate = {
  id: string;
  name: string;
  // Holds this position on the team, so is listed first.
  holder: boolean;
  // Why they can't be picked: a blackout covering the plan's date.
  out: string | null;
  // Worth knowing, but doesn't stop them: already on another service that day.
  note: string | null;
};

// "Add" on a position: opens a sheet of people, and one tap schedules one.
// `canAddPeople` also offers a short form for someone who isn't in People yet.
// The people come as `people`, or from `load` when the sheet opens. `children` and
// `className` replace the Add button. With `replace`, the person picked takes that
// person's place. `onDone` runs once someone has been picked.
export function AssignPerson({
  planId,
  positionId,
  positionName,
  people,
  load,
  canAddPeople,
  replace,
  onDone,
  className = "flex min-h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-400/10",
  children,
}: {
  planId: string;
  positionId: string;
  positionName: string;
  people?: Candidate[];
  load?: () => Promise<Candidate[]>;
  canAddPeople: boolean;
  replace?: { assignmentId: string; name: string; asked: boolean };
  onDone?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [loaded, setLoaded] = useState<Candidate[] | "failed" | null>(null);
  const list = people ?? (Array.isArray(loaded) ? loaded : null);

  async function open() {
    dialog.current?.showModal();
    if (!load) return;
    setLoaded(null);
    try {
      setLoaded(await load());
    } catch {
      setLoaded("failed");
    }
  }

  const [state, addNew] = useActionState(addNewPersonToPlan, undefined);
  // The new person is on the plan, so the sheet has done its job.
  useEffect(() => {
    if (state?.ok) {
      dialog.current?.close();
      onDone?.();
    }
  }, [state, onDone]);
  const groups: [string, Candidate[]][] = [
    [positionName, (list ?? []).filter((p) => p.holder)],
    ["Everyone else", (list ?? []).filter((p) => !p.holder)],
  ];

  return (
    <>
      <button type="button" onClick={open} aria-label={replace ? `Replace ${replace.name}` : `Add a person to ${positionName}`} title={replace ? "Replace" : undefined} className={className}>
        {children ?? (
          <>
            <Icon name="plus" className="h-3.5 w-3.5" />
            Add
          </>
        )}
      </button>

      <dialog
        ref={dialog}
        // A click on the dimmed area around the sheet closes it.
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        // Presses in here aren't for whatever draggable thing the button sits in.
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="m-0 mt-auto max-h-[80vh] w-full max-w-none rounded-t-2xl bg-surface-raised p-0 text-foreground shadow-2xl backdrop:bg-black/50 sm:m-auto sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex max-h-[80vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-black/10 px-5 py-3 dark:border-white/10">
            <h3 className="font-semibold">{replace ? `Replace ${replace.name}` : `Add to ${positionName}`}</h3>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="icon-btn">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>

          {replace?.asked && <p className="muted border-b border-black/10 px-5 py-2 text-sm dark:border-white/10">They&apos;ve already been asked, and won&apos;t be told about this.</p>}

          <form
            action={replace ? swapAssignment : addAssignment}
            onSubmit={() => {
              dialog.current?.close();
              onDone?.();
            }}
            className="min-h-0 overflow-y-auto px-2 py-2"
          >
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="positionId" value={positionId} />
            {replace && <input type="hidden" name="assignmentId" value={replace.assignmentId} />}
            {!list && <p className="muted px-3 py-4 text-sm">{loaded === "failed" ? "That couldn't be loaded. Close this and try again." : "Loading…"}</p>}
            {list?.length === 0 && <p className="muted px-3 py-4 text-sm">Everyone is already on this position.</p>}
            {groups.map(
              ([label, list]) =>
                list.length > 0 && (
                  <div key={label}>
                    <div className="muted px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide">{label}</div>
                    {list.map((person) => (
                      <button
                        key={person.id}
                        type="submit"
                        name="personId"
                        value={person.id}
                        disabled={Boolean(person.out)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent dark:hover:bg-indigo-400/10"
                      >
                        <Avatar name={person.name} className="h-9 w-9 text-xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{person.name}</span>
                          {person.out && <span className="block truncate text-xs text-red-600 dark:text-red-400">{person.out}</span>}
                          {!person.out && person.note && <span className="block truncate text-xs text-amber-700 dark:text-amber-300">{person.note}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )
            )}
          </form>

          {canAddPeople && !replace && (
            <details className="shrink-0 border-t border-black/10 px-5 py-3 dark:border-white/10">
              <summary className="cursor-pointer text-sm font-medium hover:text-indigo-600 dark:hover:text-indigo-300">New person</summary>
              <form action={addNew} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="positionId" value={positionId} />
                <div className="flex gap-2">
                  <input name="firstName" placeholder="First name" aria-label="First name" required className="input min-w-0 flex-1" />
                  <input name="lastName" placeholder="Last name" aria-label="Last name" required className="input min-w-0 flex-1" />
                </div>
                <input name="email" type="email" placeholder="Email (optional)" aria-label="Email" className="input" />
                <p className="muted text-xs">They are added to People and to {positionName}, and scheduled on this plan. The rest of their details can be filled in later.</p>
                <FormMessage state={state?.error ? state : undefined} />
                <SubmitButton className="btn btn-primary self-start" pendingLabel="Adding…">
                  Add and schedule
                </SubmitButton>
              </form>
            </details>
          )}
        </div>
      </dialog>
    </>
  );
}
