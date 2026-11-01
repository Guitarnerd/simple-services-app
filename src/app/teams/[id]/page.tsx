import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageTeam, getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import {
  addPersonToPosition,
  deletePosition,
  deleteTeam,
  removePersonFromPosition,
  setTeamLeader,
} from "@/lib/actions/teams";
import { Page } from "@/components/page";
import { SubmitButton } from "@/components/form";
import { AddPositionForm, RenameTeamForm } from "@/components/team-forms";
import { PositionDrop } from "@/components/position-drop";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();

  const [team, everyone] = await Promise.all([
    prisma.team.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        leaders: { include: { person: true } },
        positions: {
          orderBy: { sortOrder: "asc" },
          include: {
            people: {
              where: { person: { archived: false } },
              include: { person: true },
              orderBy: [{ person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
            },
          },
        },
      },
    }),
    prisma.person.findMany({
      where: { organizationId: user.organizationId, archived: false },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  if (!team) notFound();

  const canManage = canManageTeam(user, team.id);
  const isPlanner = hasRole(user.role, "PLANNER");
  const leaderIds = new Set(team.leaders.map((l) => l.personId));

  return (
    <Page title={team.name} back={{ href: "/teams", label: "Teams" }}>
      <section className="card">
        <h2 className="mb-2 font-semibold">Team leaders</h2>
        {team.leaders.length === 0 ? (
          <p className="muted text-sm">No leaders yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {team.leaders.map(({ person }) => (
              <li key={person.id} className="badge gap-1">
                <Link href={`/people/${person.id}`} className="hover:underline">
                  {person.firstName} {person.lastName}
                </Link>
                {isPlanner && (
                  <form action={setTeamLeader}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="personId" value={person.id} />
                    <input type="hidden" name="leads" value="false" />
                    <button type="submit" aria-label={`Remove ${person.firstName} as leader`} className="cursor-pointer px-1 hover:text-red-600">
                      ×
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {isPlanner && (
          <form action={setTeamLeader} className="mt-3 flex gap-2">
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="leads" value="true" />
            <select name="personId" required defaultValue="" aria-label="Person to make a leader" className="input flex-1">
              <option value="" disabled>
                Choose a person…
              </option>
              {everyone
                .filter((p) => !leaderIds.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName}
                  </option>
                ))}
            </select>
            <SubmitButton className="btn btn-secondary">Make leader</SubmitButton>
          </form>
        )}
        {isPlanner && (
          <p className="muted mt-2 text-xs">Leaders can add and remove people and positions on this team.</p>
        )}
      </section>

      {team.positions.map((position) => {
        const holderIds = new Set(position.people.map((pp) => pp.personId));
        return (
          <PositionDrop key={position.id} positionId={position.id} enabled={canManage}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="font-semibold">
                {position.name} <span className="muted font-normal">({position.people.length})</span>
              </h2>
              {canManage && (
                <form action={deletePosition}>
                  <input type="hidden" name="positionId" value={position.id} />
                  <SubmitButton
                    className="muted cursor-pointer text-sm hover:text-red-600"
                    confirm={`Delete the ${position.name} position? The people stay in the directory.`}
                  >
                    Delete
                  </SubmitButton>
                </form>
              )}
            </div>

            {position.people.length === 0 ? (
              <p className="muted text-sm">No one yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {position.people.map(({ person }) => (
                  <li key={person.id} className="badge gap-1">
                    <Link href={`/people/${person.id}`} className="hover:underline">
                      {person.firstName} {person.lastName}
                    </Link>
                    {canManage && (
                      <form action={removePersonFromPosition}>
                        <input type="hidden" name="positionId" value={position.id} />
                        <input type="hidden" name="personId" value={person.id} />
                        <button type="submit" aria-label={`Remove ${person.firstName} from ${position.name}`} className="cursor-pointer px-1 hover:text-red-600">
                          ×
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canManage && (
              <form action={addPersonToPosition} className="mt-3 flex gap-2">
                <input type="hidden" name="positionId" value={position.id} />
                <select name="personId" required defaultValue="" aria-label={`Person to add to ${position.name}`} className="input flex-1">
                  <option value="" disabled>
                    Add a person…
                  </option>
                  {everyone
                    .filter((p) => !holderIds.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.lastName}, {p.firstName}
                      </option>
                    ))}
                </select>
                <SubmitButton className="btn btn-secondary">Add</SubmitButton>
              </form>
            )}
          </PositionDrop>
        );
      })}

      {canManage && (
        <section className="card">
          <AddPositionForm teamId={team.id} />
        </section>
      )}

      {isPlanner && (
        <section className="card flex flex-col gap-4">
          <RenameTeamForm teamId={team.id} name={team.name} />
          <form action={deleteTeam}>
            <input type="hidden" name="teamId" value={team.id} />
            <SubmitButton
              className="btn btn-danger"
              confirm={`Delete the ${team.name} team and all of its positions? The people stay in the directory. This can't be undone.`}
            >
              Delete team
            </SubmitButton>
          </form>
        </section>
      )}
    </Page>
  );
}
