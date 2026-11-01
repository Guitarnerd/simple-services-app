"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageTeam, getCurrentUser, requireRole } from "@/lib/dal";
import type { FormState } from "@/components/form";

function readName(formData: FormData) {
  return String(formData.get("name") ?? "").trim();
}

export async function createTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const name = readName(formData);
  if (!name) return { error: "Give the team a name." };

  const existing = await prisma.team.findUnique({
    where: { organizationId_name: { organizationId: user.organizationId, name } },
  });
  if (existing) return { error: `There's already a team called ${name}.` };

  const count = await prisma.team.count({ where: { organizationId: user.organizationId } });
  const team = await prisma.team.create({
    data: { organizationId: user.organizationId, name, sortOrder: count },
  });
  redirect(`/teams/${team.id}`);
}

export async function renameTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const teamId = String(formData.get("teamId") ?? "");
  const name = readName(formData);
  if (!name) return { error: "Give the team a name." };

  const clash = await prisma.team.findFirst({
    where: { organizationId: user.organizationId, name, id: { not: teamId } },
  });
  if (clash) return { error: `There's already a team called ${name}.` };

  await prisma.team.updateMany({
    where: { id: teamId, organizationId: user.organizationId },
    data: { name },
  });
  revalidatePath(`/teams/${teamId}`);
  return { ok: "Renamed." };
}

export async function deleteTeam(formData: FormData) {
  const user = await requireRole("PLANNER");
  const teamId = String(formData.get("teamId") ?? "");
  await prisma.team.deleteMany({ where: { id: teamId, organizationId: user.organizationId } });
  redirect("/teams");
}

async function manageableTeam(teamId: string) {
  const user = await getCurrentUser();
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: user.organizationId },
  });
  if (!team || !canManageTeam(user, team.id)) return null;
  return { user, team };
}

export async function addPosition(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = String(formData.get("teamId") ?? "");
  const name = readName(formData);
  if (!(await manageableTeam(teamId))) return { error: "You don't have permission to do that." };
  if (!name) return { error: "Give the position a name." };

  const existing = await prisma.position.findUnique({ where: { teamId_name: { teamId, name } } });
  if (existing) return { error: `This team already has ${name}.` };

  const count = await prisma.position.count({ where: { teamId } });
  await prisma.position.create({ data: { teamId, name, sortOrder: count } });
  revalidatePath(`/teams/${teamId}`);
  return undefined;
}

// A position added from a plan. The plan then shows it, even when the service's
// template doesn't ask for it, so there is somewhere to add the person.
export async function addPlanPosition(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = String(formData.get("teamId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const name = readName(formData);
  const access = await manageableTeam(teamId);
  if (!access) return { error: "You don't have permission to do that." };
  if (!name) return { error: "Give the position a name." };

  const plan = await prisma.plan.findFirst({ where: { id: planId, organizationId: access.user.organizationId } });
  if (!plan) return { error: "That plan no longer exists." };

  const existing = await prisma.position.findUnique({ where: { teamId_name: { teamId, name } } });
  if (existing) return { error: `This team already has ${name}.` };

  const count = await prisma.position.count({ where: { teamId } });
  const position = await prisma.position.create({ data: { teamId, name, sortOrder: count } });
  revalidatePath(`/teams/${teamId}`);
  redirect(`/plans/${planId}?position=${position.id}`);
}

export async function deletePosition(formData: FormData) {
  const positionId = String(formData.get("positionId") ?? "");
  const position = await prisma.position.findUnique({ where: { id: positionId } });
  if (!position || !(await manageableTeam(position.teamId))) return;

  await prisma.position.delete({ where: { id: positionId } });
  revalidatePath(`/teams/${position.teamId}`);
}

export async function addPersonToPosition(formData: FormData) {
  const positionId = String(formData.get("positionId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const position = await prisma.position.findUnique({ where: { id: positionId } });
  if (!position || !personId) return;

  const access = await manageableTeam(position.teamId);
  if (!access) return;
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: access.user.organizationId },
  });
  if (!person) return;

  await prisma.personPosition.upsert({
    where: { personId_positionId: { personId, positionId } },
    update: {},
    create: { personId, positionId },
  });
  revalidatePath(`/teams/${position.teamId}`);
}

export async function removePersonFromPosition(formData: FormData) {
  const positionId = String(formData.get("positionId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const position = await prisma.position.findUnique({ where: { id: positionId } });
  if (!position || !(await manageableTeam(position.teamId))) return;

  await prisma.personPosition.deleteMany({ where: { personId, positionId } });
  revalidatePath(`/teams/${position.teamId}`);
}

// Making a member a team's leader raises them to the Team leader level;
// removing their last team drops them back to Member.
export async function setTeamLeader(formData: FormData) {
  const user = await requireRole("PLANNER");
  const teamId = String(formData.get("teamId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const leads = formData.get("leads") === "true";

  const [team, person] = await Promise.all([
    prisma.team.findFirst({ where: { id: teamId, organizationId: user.organizationId } }),
    prisma.person.findFirst({ where: { id: personId, organizationId: user.organizationId } }),
  ]);
  if (!team || !person) return;

  if (leads) {
    await prisma.teamLeader.upsert({
      where: { personId_teamId: { personId, teamId } },
      update: {},
      create: { personId, teamId },
    });
    if (person.role === "MEMBER") {
      await prisma.person.update({ where: { id: personId }, data: { role: "LEADER" } });
    }
  } else {
    await prisma.teamLeader.deleteMany({ where: { personId, teamId } });
    const remaining = await prisma.teamLeader.count({ where: { personId } });
    if (remaining === 0 && person.role === "LEADER") {
      await prisma.person.update({ where: { id: personId }, data: { role: "MEMBER" } });
    }
  }
  revalidatePath(`/teams/${teamId}`);
}

// Dropping a person on a position, from the People pane of a merged screen. Unlike the form actions
// above it says what happened, so the screen can tell whoever did it.
export async function dropPersonOnPosition(positionId: string, personId: string): Promise<{ ok: string; added: boolean } | { error: string }> {
  const position = await prisma.position.findUnique({ where: { id: positionId } });
  if (!position) return { error: "That position no longer exists." };

  const access = await manageableTeam(position.teamId);
  if (!access) return { error: "You don't have permission to change this team." };
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: access.user.organizationId, archived: false },
  });
  if (!person) return { error: "That person isn't in the directory any more." };

  const existing = await prisma.personPosition.findUnique({ where: { personId_positionId: { personId, positionId } } });
  if (existing) return { ok: `${person.firstName} is already in ${position.name}.`, added: false };

  await prisma.personPosition.create({ data: { personId, positionId } });
  revalidatePath(`/teams/${position.teamId}`);
  return { ok: `Added ${person.firstName} to ${position.name}.`, added: true };
}
