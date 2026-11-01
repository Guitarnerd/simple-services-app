"use client";

import { useActionState } from "react";
import { savePositions, saveRole, sendInvite } from "@/lib/actions/people";
import { FormMessage, SubmitButton } from "@/components/form";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/roles";

type TeamOption = {
  id: string;
  name: string;
  positions: { id: string; name: string; checked: boolean }[];
};

export function PositionsForm({ personId, teams }: { personId: string; teams: TeamOption[] }) {
  const [state, formAction] = useActionState(savePositions, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="personId" value={personId} />
      {teams.map((team) => (
        <fieldset key={team.id}>
          <legend className="label">{team.name}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {team.positions.map((position) => (
              <label key={position.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="positionId" value={position.id} defaultChecked={position.checked} />
                {position.name}
              </label>
            ))}
            {team.positions.length === 0 && <span className="muted text-sm">No positions yet.</span>}
          </div>
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
          Save positions
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RoleForm({ personId, role }: { personId: string; role: Role }) {
  const [state, formAction] = useActionState(saveRole, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="personId" value={personId} />
      <div className="flex flex-col gap-2">
        {ROLES.map((option) => (
          <label key={option} className="flex items-start gap-2 text-sm">
            <input type="radio" name="role" value={option} defaultChecked={option === role} className="mt-1" />
            <span>
              <span className="font-medium">{ROLE_LABELS[option]}</span>
              <span className="muted block">{ROLE_DESCRIPTIONS[option]}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
          Save permission level
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function InviteForm({ personId, label }: { personId: string; label: string }) {
  const [state, formAction] = useActionState(sendInvite, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="personId" value={personId} />
      <div>
        <SubmitButton pendingLabel="Sending…">{label}</SubmitButton>
      </div>
      <FormMessage state={state} />
      {state?.link && (
        <input readOnly value={state.link} onFocus={(e) => e.target.select()} aria-label="Invitation link" className="input font-mono !text-xs" />
      )}
    </form>
  );
}
