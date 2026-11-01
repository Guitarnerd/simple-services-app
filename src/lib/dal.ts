import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasRole, type Role } from "@/lib/roles";
import { currentApiUser } from "@/lib/api-user";

// Returns null instead of redirecting, for the root layout. During a request from
// the Claude connection it is the token's person (see src/lib/api-user.ts).
export async function getOptionalUser() {
  return currentApiUser() ?? sessionUser();
}

const sessionUser = cache(async () => {
  const session = await getSession();
  if (!session.personId) return null;

  const person = await prisma.person.findUnique({
    where: { id: session.personId },
    include: { leading: { select: { teamId: true } } },
  });
  if (!person || person.archived || !person.passwordHash) return null;

  return {
    id: person.id,
    organizationId: person.organizationId,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    role: person.role as Role,
    leadsTeamIds: person.leading.map((l) => l.teamId),
  };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof sessionUser>>>;

export async function getCurrentUser(): Promise<CurrentUser> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(minimum: Role) {
  const user = await getCurrentUser();
  if (!hasRole(user.role, minimum)) redirect("/");
  return user;
}

// Planners and admins manage every team; leaders only the teams they lead.
export function canManageTeam(user: CurrentUser, teamId: string) {
  if (hasRole(user.role, "PLANNER")) return true;
  return user.role === "LEADER" && user.leadsTeamIds.includes(teamId);
}

// Planners and admins edit anyone; everyone can edit their own profile.
export function canEditPerson(user: CurrentUser, personId: string) {
  return hasRole(user.role, "PLANNER") || user.id === personId;
}
