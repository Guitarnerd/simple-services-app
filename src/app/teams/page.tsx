import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { Page } from "@/components/page";
import { CreateTeamForm } from "@/components/team-forms";
import { PositionChip } from "@/components/position-chip";
import { TeamCard } from "@/components/team-card";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const user = await getCurrentUser();

  const teams = await prisma.team.findMany({
    where: { organizationId: user.organizationId },
    include: {
      positions: {
        orderBy: { sortOrder: "asc" },
        include: { people: { where: { person: { archived: false } }, select: { personId: true } } },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <Page title="Teams" subtitle="Teams group the positions people can be scheduled for.">
      {teams.length === 0 && <p className="empty">No teams yet.</p>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {teams.map((team) => {
          const memberCount = new Set(team.positions.flatMap((p) => p.people.map((pp) => pp.personId))).size;
          return (
            <TeamCard key={team.id} team={{ id: team.id, name: team.name }} positions={team.positions.map((p) => ({ id: p.id, name: p.name }))}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{team.name}</h2>
                <span className="muted text-sm">
                  {memberCount} {memberCount === 1 ? "person" : "people"}
                </span>
              </div>
              {team.positions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {team.positions.map((p) => (
                    <PositionChip key={p.id} id={p.id} name={p.name} count={p.people.length} />
                  ))}
                </div>
              ) : (
                <p className="muted text-sm">No positions yet</p>
              )}
            </TeamCard>
          );
        })}
      </div>

      {hasRole(user.role, "PLANNER") && <CreateTeamForm />}
    </Page>
  );
}
