"use client";

import { useActionState } from "react";
import { addPlanPosition, addPosition, createTeam, renameTeam } from "@/lib/actions/teams";
import { FormMessage, SubmitButton } from "@/components/form";

export function CreateTeamForm() {
  const [state, formAction] = useActionState(createTeam, undefined);

  return (
    <form action={formAction} className="card flex flex-col gap-2">
      <label className="label" htmlFor="new-team">
        New team
      </label>
      <div className="flex gap-2">
        <input id="new-team" name="name" placeholder="e.g. Greeters" required className="input flex-1" />
        <SubmitButton pendingLabel="Adding…">Add team</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function RenameTeamForm({ teamId, name }: { teamId: string; name: string }) {
  const [state, formAction] = useActionState(renameTeam, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <label className="label" htmlFor="team-name">
        Team name
      </label>
      <div className="flex gap-2">
        <input id="team-name" name="name" defaultValue={name} required className="input flex-1" />
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
          Rename
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function AddPositionForm({ teamId }: { teamId: string }) {
  const [state, formAction] = useActionState(addPosition, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="flex gap-2">
        <input name="name" autoComplete="off" placeholder="New position, e.g. Bass" aria-label="New position name" required className="input flex-1" />
        <SubmitButton className="btn btn-secondary" pendingLabel="Adding…">
          Add position
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

// Under a team on a plan: a position the team doesn't have yet.
export function NewPlanPositionForm({ teamId, planId, teamName }: { teamId: string; planId: string; teamName: string }) {
  const [state, formAction] = useActionState(addPlanPosition, undefined);

  return (
    <details>
      <summary className="muted cursor-pointer py-1 text-sm hover:text-indigo-600 dark:hover:text-indigo-300">New position</summary>
      <form action={formAction} className="flex flex-col gap-2 pb-1 pt-1">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="planId" value={planId} />
        <div className="flex gap-2">
          <input name="name" placeholder="e.g. Bass" aria-label={`New position on ${teamName}`} required className="input flex-1" />
          <SubmitButton className="btn btn-secondary" pendingLabel="Adding…">
            Add
          </SubmitButton>
        </div>
        <FormMessage state={state} />
      </form>
    </details>
  );
}
