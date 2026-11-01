"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageTeam, getCurrentUser, requireRole } from "@/lib/dal";
import { anotherPositionName, planNeeds } from "@/lib/auto-schedule";
import { formatPlanDate, isClockTime, parseLength } from "@/lib/format";
import type { FormState } from "@/components/form";

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim() || null;
}

function readDate(formData: FormData) {
  const value = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ----- Service types -----

export async function saveServiceType(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const id = String(formData.get("serviceTypeId") ?? "") || null;
  const name = text(formData, "name");
  const defaultTime = text(formData, "defaultTime");
  if (!name) return { error: "Give the service type a name." };
  if (defaultTime && !isClockTime(defaultTime)) return { error: "That start time isn't valid." };

  const clash = await prisma.serviceType.findFirst({
    where: { organizationId: user.organizationId, name, ...(id ? { id: { not: id } } : {}) },
  });
  if (clash) return { error: `There's already a service type called ${name}.` };

  if (!id) {
    const count = await prisma.serviceType.count({ where: { organizationId: user.organizationId } });
    const created = await prisma.serviceType.create({
      data: { organizationId: user.organizationId, name, defaultTime, sortOrder: count },
    });
    revalidatePath("/plans", "layout");
    // Straight on to its page, where its template is built.
    redirect(`/plans/types/${created.id}`);
  }

  await prisma.serviceType.updateMany({
    where: { id, organizationId: user.organizationId },
    data: { name, defaultTime },
  });
  revalidatePath("/plans", "layout");
  return { ok: "Saved." };
}

export async function deleteServiceType(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const id = String(formData.get("serviceTypeId") ?? "");

  const plans = await prisma.plan.count({ where: { serviceTypeId: id, organizationId: user.organizationId } });
  if (plans > 0) {
    return { error: `This type has ${plans} ${plans === 1 ? "plan" : "plans"}. Delete or move those first.` };
  }

  await prisma.serviceType.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath("/plans", "layout");
  redirect("/plans/types");
}

// ----- Service type templates -----

const TEMPLATE_TYPES = ["SONG", "ITEM", "HEADER"] as const;

// Replaces the rows a new plan of this type starts with. `items` is the whole
// list as JSON: [{ type, title, length, preService, notes }].
export async function saveTemplateItems(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const serviceType = await prisma.serviceType.findFirst({
    where: { id: String(formData.get("serviceTypeId") ?? ""), organizationId: user.organizationId },
  });
  if (!serviceType) return { error: "That service type no longer exists." };

  let rows: unknown;
  try {
    rows = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    rows = null;
  }
  if (!Array.isArray(rows) || rows.length > 100) return { error: "That template couldn't be read." };

  const items: { type: (typeof TEMPLATE_TYPES)[number]; title: string; lengthSeconds: number | null; preService: boolean; notes: string | null }[] = [];
  for (const row of rows) {
    const type = TEMPLATE_TYPES.find((t) => t === row?.type);
    if (!type) return { error: "That template couldn't be read." };
    // A row still being typed has no title yet; a song slot can go without one.
    const title = String(row.title ?? "").trim() || (type === "SONG" ? "Song" : "");
    if (!title) continue;
    const lengthSeconds = type === "HEADER" ? null : parseLength(String(row.length ?? ""));
    if (Number.isNaN(lengthSeconds)) return { error: `Write the length of ${title} like 4:30.` };
    items.push({ type, title: title.slice(0, 200), lengthSeconds, preService: type === "HEADER" && row.preService === true, notes: String(row.notes ?? "").trim().slice(0, 2000) || null });
  }

  await prisma.$transaction([
    prisma.templateItem.deleteMany({ where: { serviceTypeId: serviceType.id } }),
    prisma.templateItem.createMany({
      data: items.map((item, position) => ({ ...item, position, serviceTypeId: serviceType.id })),
    }),
  ]);
  revalidatePath("/plans/types", "layout");
  return { ok: "Saved." };
}

// Sets how many people this type needs in each position, from fields named
// "need-<positionId>", ticked "optional-<positionId>" if it's only nice to have.
// Blank or 0 means the position isn't used.
export async function saveTemplatePositions(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const serviceType = await prisma.serviceType.findFirst({
    where: { id: String(formData.get("serviceTypeId") ?? ""), organizationId: user.organizationId },
  });
  if (!serviceType) return { error: "That service type no longer exists." };

  const positions = await prisma.position.findMany({
    where: { team: { organizationId: user.organizationId } },
    select: { id: true },
  });
  const needs = positions
    .map((position) => ({ positionId: position.id, quantity: Math.floor(Number(formData.get(`need-${position.id}`) ?? 0)) }))
    .filter((need) => need.quantity > 0)
    .map((need) => ({ ...need, quantity: Math.min(need.quantity, 20), optional: formData.has(`optional-${need.positionId}`), serviceTypeId: serviceType.id }));

  await prisma.$transaction([
    prisma.templatePosition.deleteMany({ where: { serviceTypeId: serviceType.id } }),
    prisma.templatePosition.createMany({ data: needs }),
  ]);
  revalidatePath("/plans", "layout");
  return { ok: "Saved." };
}

// ----- Plans -----

// Sets what this plan needs, from the same fields as `saveTemplatePositions`, for the
// teams this person manages. Only differences from the service type are kept, so a
// later change to the service type still reaches positions this plan left alone.
export async function savePlanPositions(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const plan = await prisma.plan.findFirst({ where: { id: String(formData.get("planId") ?? ""), organizationId: user.organizationId } });
  if (!plan) return { error: "That plan no longer exists." };

  const [positions, template] = await Promise.all([
    prisma.position.findMany({ where: { team: { organizationId: user.organizationId } }, select: { id: true, teamId: true } }),
    prisma.templatePosition.findMany({ where: { serviceTypeId: plan.serviceTypeId } }),
  ]);
  const mine = positions.filter((position) => canManageTeam(user, position.teamId));
  if (mine.length === 0) return { error: "You don't have permission to do that." };

  const changes = mine.flatMap((position) => {
    const quantity = Math.min(Math.max(0, Math.floor(Number(formData.get(`need-${position.id}`) ?? 0))) || 0, 20);
    const optional = quantity > 0 && formData.has(`optional-${position.id}`);
    const usual = template.find((need) => need.positionId === position.id);
    if (quantity === (usual?.quantity ?? 0) && (quantity === 0 || optional === usual?.optional)) return [];
    return [{ planId: plan.id, positionId: position.id, quantity, optional }];
  });

  await prisma.$transaction([
    prisma.planPosition.deleteMany({ where: { planId: plan.id, positionId: { in: mine.map((position) => position.id) } } }),
    prisma.planPosition.createMany({ data: changes }),
  ]);
  revalidatePath(`/plans/${plan.id}`);
  revalidatePath("/");
  return { ok: "Positions saved." };
}

// The plan and position, if this person may change that position on it.
async function managedPlanPosition(planId: string, positionId: string) {
  const user = await getCurrentUser();
  const [plan, position] = await Promise.all([
    prisma.plan.findFirst({ where: { id: planId, organizationId: user.organizationId } }),
    prisma.position.findFirst({ where: { id: positionId, team: { organizationId: user.organizationId } } }),
  ]);
  return plan && position && canManageTeam(user, position.teamId) ? plan : null;
}

async function needsOf(plan: { id: string; serviceTypeId: string }) {
  const [template, own] = await Promise.all([prisma.templatePosition.findMany({ where: { serviceTypeId: plan.serviceTypeId } }), prisma.planPosition.findMany({ where: { planId: plan.id } })]);
  return { template, needs: planNeeds(template, own) };
}

// Keeps a row only where the plan differs from its service type, as `savePlanPositions` does.
async function writePlanNeed(plan: { id: string; serviceTypeId: string }, positionId: string, quantity: number, optional: boolean) {
  const usual = await prisma.templatePosition.findFirst({ where: { serviceTypeId: plan.serviceTypeId, positionId } });
  const same = quantity === (usual?.quantity ?? 0) && (quantity === 0 || optional === usual?.optional);
  const key = { planId_positionId: { planId: plan.id, positionId } };
  if (same) await prisma.planPosition.deleteMany({ where: { planId: plan.id, positionId } });
  else await prisma.planPosition.upsert({ where: key, update: { quantity, optional }, create: { planId: plan.id, positionId, quantity, optional } });
  revalidatePath(`/plans/${plan.id}`);
  revalidatePath("/plans/multi-view");
  revalidatePath("/");
}

// A position dragged to another service in Multi View: the need, not the people on it.
export async function copyPlanPosition(fromPlanId: string, positionId: string, toPlanId: string): Promise<ActionResult> {
  const [from, to] = await Promise.all([managedPlanPosition(fromPlanId, positionId), managedPlanPosition(toPlanId, positionId)]);
  if (!from || !to) return { error: "That position or service no longer exists, or you don't manage that team." };

  if ((await needsOf(to)).needs.some((need) => need.positionId === positionId)) return { error: `${formatPlanDate(to.date, "short")} already has that position.` };
  const need = (await needsOf(from)).needs.find((row) => row.positionId === positionId);
  await writePlanNeed(to, positionId, need?.quantity ?? 1, need?.optional ?? false);
  return {};
}

// A position dragged onto a service that already has it, and "add another" chosen:
// Guitar 2 joins it. It's a position of its own in the same team, so it can be scheduled,
// held by everyone who holds the one it came from.
export async function addAnotherPosition(fromPlanId: string, positionId: string, toPlanId: string): Promise<ActionResult> {
  const [from, to] = await Promise.all([managedPlanPosition(fromPlanId, positionId), managedPlanPosition(toPlanId, positionId)]);
  if (!from || !to) return { error: "That position or service no longer exists, or you don't manage that team." };

  const source = await prisma.position.findUniqueOrThrow({ where: { id: positionId }, include: { people: { select: { personId: true } }, team: { select: { positions: { select: { id: true, name: true } } } } } });
  const onPlan = new Set((await needsOf(to)).needs.map((need) => need.positionId));
  const name = anotherPositionName(source.name, source.team.positions.filter((position) => onPlan.has(position.id)).map((position) => position.name));

  const second = source.team.positions.find((position) => position.name === name) ?? (await prisma.position.create({ data: { teamId: source.teamId, name, sortOrder: source.sortOrder } }));
  await prisma.personPosition.createMany({ data: source.people.map(({ personId }) => ({ personId, positionId: second.id })), skipDuplicates: true });

  const need = (await needsOf(from)).needs.find((row) => row.positionId === positionId);
  await writePlanNeed(to, second.id, 1, need?.optional ?? false);
  return {};
}

// Takes a position off one service, along with anyone on it.
export async function removePlanPosition(planId: string, positionId: string): Promise<ActionResult> {
  const plan = await managedPlanPosition(planId, positionId);
  if (!plan) return { error: "That position or service no longer exists, or you don't manage that team." };

  await prisma.assignment.deleteMany({ where: { planId, positionId } });
  await writePlanNeed(plan, positionId, 0, false);
  return {};
}

// The Undo after removing a position nobody was on.
export async function setPlanPosition(planId: string, positionId: string, quantity: number, optional: boolean): Promise<ActionResult> {
  const plan = await managedPlanPosition(planId, positionId);
  if (!plan) return { error: "That position or service no longer exists, or you don't manage that team." };
  await writePlanNeed(plan, positionId, Math.min(Math.max(0, Math.floor(quantity) || 0), 20), optional === true);
  return {};
}

export async function createPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const date = readDate(formData);
  if (!date) return { error: "Pick a date." };

  const serviceType = await prisma.serviceType.findFirst({
    where: { id: String(formData.get("serviceTypeId") ?? ""), organizationId: user.organizationId },
    include: { templateItems: { orderBy: { position: "asc" } }, templateTimes: true },
  });
  if (!serviceType) return { error: "Pick a service type." };

  const startTime = text(formData, "startTime") ?? serviceType.defaultTime;
  if (startTime && !isClockTime(startTime)) return { error: "That start time isn't valid." };

  // A new plan starts as a copy of its service type's template.
  const plan = await prisma.plan.create({
    data: {
      organizationId: user.organizationId,
      serviceTypeId: serviceType.id,
      date,
      startTime,
      title: text(formData, "title"),
      items: {
        create: serviceType.templateItems.map(({ type, title, lengthSeconds, preService, notes }, position) => ({ type, title, lengthSeconds, preService, notes, position })),
      },
      // The template's times, as dates counted back from this service's date.
      times: {
        create: serviceType.templateTimes.map(({ label, time, daysBefore }) => ({ label, time, date: time ? new Date(date.getTime() - daysBefore * 24 * 60 * 60 * 1000) : null })),
      },
    },
  });
  // From the matrix, which stays where it is and shows the new column.
  if (formData.has("stay")) {
    revalidatePath("/plans/multi-view");
    revalidatePath("/plans");
    return { ok: `Added ${formatPlanDate(date, "short")}.`, link: `/plans/${plan.id}` };
  }
  redirect(`/plans/${plan.id}`);
}

export async function savePlanDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const planId = String(formData.get("planId") ?? "");
  const date = readDate(formData);
  if (!date) return { error: "Pick a date." };

  const startTime = text(formData, "startTime");
  if (startTime && !isClockTime(startTime)) return { error: "That start time isn't valid." };

  const serviceType = await prisma.serviceType.findFirst({
    where: { id: String(formData.get("serviceTypeId") ?? ""), organizationId: user.organizationId },
  });
  if (!serviceType) return { error: "Pick a service type." };

  const { count } = await prisma.plan.updateMany({
    where: { id: planId, organizationId: user.organizationId },
    data: {
      date,
      startTime,
      serviceTypeId: serviceType.id,
      title: text(formData, "title"),
      notes: text(formData, "notes"),
    },
  });
  if (count === 0) return { error: "That plan no longer exists." };

  revalidatePath(`/plans/${planId}`);
  return { ok: "Saved." };
}

export async function deletePlan(formData: FormData) {
  const user = await requireRole("PLANNER");
  await prisma.plan.deleteMany({
    where: { id: String(formData.get("planId") ?? ""), organizationId: user.organizationId },
  });
  redirect("/plans");
}

// ----- Other times on a plan, and on a service type's template -----

function readLabel(formData: FormData) {
  return (text(formData, "label") ?? "").slice(0, 60);
}

// What the form says the time is: its label, and its day and hour (both empty for "TBD").
function readPlanTime(formData: FormData): { error: string } | { label: string; date: Date | null; time: string | null } {
  const label = readLabel(formData);
  if (!label) return { error: "Say what the time is for, such as Rehearsal." };
  // "TBD": on the plan, with the day and time still to be decided.
  if (formData.get("tbd")) return { label, date: null, time: null };
  const date = readDate(formData);
  const time = text(formData, "time");
  if (!date) return { error: "Pick a date, or tick TBD." };
  if (!time || !isClockTime(time)) return { error: "Pick a time, or tick TBD." };
  return { label, date, time };
}

export async function addPlanTime(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const plan = await prisma.plan.findFirst({ where: { id: String(formData.get("planId") ?? ""), organizationId: user.organizationId } });
  if (!plan) return { error: "That plan no longer exists." };

  const values = readPlanTime(formData);
  if ("error" in values) return values;
  await prisma.planTime.create({ data: { planId: plan.id, ...values } });
  revalidatePath(`/plans/${plan.id}`);
  revalidatePath("/");
  return { ok: "Added." };
}

export async function updatePlanTime(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const existing = await prisma.planTime.findFirst({ where: { id: String(formData.get("timeId") ?? ""), plan: { organizationId: user.organizationId } } });
  if (!existing) return { error: "That time is no longer on the plan." };

  const values = readPlanTime(formData);
  if ("error" in values) return values;
  await prisma.planTime.update({ where: { id: existing.id }, data: values });
  revalidatePath(`/plans/${existing.planId}`);
  revalidatePath("/");
  return { ok: "Saved." };
}

export async function removePlanTime(formData: FormData) {
  const user = await requireRole("PLANNER");
  const time = await prisma.planTime.findFirst({ where: { id: String(formData.get("timeId") ?? ""), plan: { organizationId: user.organizationId } } });
  if (!time) return;
  await prisma.planTime.delete({ where: { id: time.id } });
  revalidatePath(`/plans/${time.planId}`);
  revalidatePath("/");
}

export async function addTemplateTime(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const serviceType = await prisma.serviceType.findFirst({ where: { id: String(formData.get("serviceTypeId") ?? ""), organizationId: user.organizationId } });
  if (!serviceType) return { error: "That service type no longer exists." };

  const label = readLabel(formData);
  const tbd = Boolean(formData.get("tbd"));
  const time = tbd ? null : text(formData, "time");
  const daysBefore = tbd ? 0 : Math.floor(Number(formData.get("daysBefore") ?? 0));
  if (!label) return { error: "Say what the time is for, such as Rehearsal." };
  if (!tbd && (!time || !isClockTime(time))) return { error: "Pick a time, or tick TBD." };
  if (!(daysBefore >= 0 && daysBefore <= 14)) return { error: "Days before should be between 0 and 14." };

  await prisma.templateTime.create({ data: { serviceTypeId: serviceType.id, label, time, daysBefore } });
  revalidatePath("/plans/types", "layout");
  return { ok: "Added." };
}

export async function removeTemplateTime(formData: FormData) {
  const user = await requireRole("PLANNER");
  const time = await prisma.templateTime.findFirst({ where: { id: String(formData.get("timeId") ?? ""), serviceType: { organizationId: user.organizationId } } });
  if (!time) return;
  await prisma.templateTime.delete({ where: { id: time.id } });
  revalidatePath("/plans/types", "layout");
}

// ----- Plan items (called directly from the plan editor) -----

type ActionResult = { error?: string };

async function ownedPlan(planId: string) {
  const user = await requireRole("PLANNER");
  const plan = await prisma.plan.findFirst({ where: { id: planId, organizationId: user.organizationId } });
  return plan ? { user, plan } : null;
}

export async function addPlanItem(
  planId: string,
  input: { type: "SONG"; songId: string } | { type: "ITEM" | "HEADER"; title: string }
): Promise<ActionResult> {
  const owned = await ownedPlan(planId);
  if (!owned) return { error: "That plan no longer exists." };

  const last = await prisma.planItem.findFirst({ where: { planId }, orderBy: { position: "desc" } });
  const position = (last?.position ?? -1) + 1;

  if (input.type === "SONG") {
    const song = await prisma.song.findFirst({
      where: { id: input.songId, organizationId: owned.user.organizationId },
      include: { arrangements: { orderBy: { sortOrder: "asc" }, take: 1 } },
    });
    if (!song) return { error: "That song no longer exists." };
    const arrangement = song.arrangements[0];
    await prisma.planItem.create({
      data: {
        planId,
        type: "SONG",
        position,
        title: song.title,
        songId: song.id,
        arrangementId: arrangement?.id,
        key: arrangement?.key,
        lengthSeconds: arrangement?.lengthSeconds,
      },
    });
  } else {
    const title = input.title.trim();
    if (!title) return { error: "Give it a title." };
    await prisma.planItem.create({ data: { planId, type: input.type, position, title } });
  }

  revalidatePath(`/plans/${planId}`);
  return {};
}

export async function updatePlanItem(
  itemId: string,
  input: { title: string; length: string; preService: boolean; tag: boolean; key: string; notes: string; arrangementId: string }
): Promise<ActionResult> {
  const user = await requireRole("PLANNER");
  const item = await prisma.planItem.findFirst({
    where: { id: itemId, plan: { organizationId: user.organizationId } },
    include: { song: { include: { arrangements: true } } },
  });
  if (!item) return { error: "That item no longer exists." };

  const lengthSeconds = parseLength(input.length);
  if (Number.isNaN(lengthSeconds)) return { error: "Write the length like 4:30." };

  const title = input.title.trim();
  // A song from the library always shows the song's own title; an empty song slot has its own.
  const ownTitle = item.type !== "SONG" || !item.songId;
  if (ownTitle && !title) return { error: "Give it a title." };

  const arrangement = item.song?.arrangements.find((a) => a.id === input.arrangementId);

  await prisma.planItem.update({
    where: { id: itemId },
    data: {
      ...(ownTitle ? { title } : {}),
      ...(item.type === "SONG" && arrangement ? { arrangementId: arrangement.id } : {}),
      lengthSeconds: item.type === "HEADER" ? null : lengthSeconds,
      preService: item.type === "HEADER" && input.preService === true,
      tag: item.type === "SONG" && input.tag === true,
      key: item.type === "SONG" ? input.key.trim() || null : null,
      notes: input.notes.trim() || null,
    },
  });

  revalidatePath(`/plans/${item.planId}`);
  revalidatePath("/plans/multi-view");
  return {};
}

// Fills an empty song slot with a song from the library, or swaps the song in a row.
export async function setPlanItemSong(itemId: string, songId: string): Promise<ActionResult> {
  const user = await requireRole("PLANNER");
  const [item, song] = await Promise.all([
    prisma.planItem.findFirst({ where: { id: itemId, type: "SONG", plan: { organizationId: user.organizationId } } }),
    prisma.song.findFirst({
      where: { id: songId, organizationId: user.organizationId },
      include: { arrangements: { orderBy: { sortOrder: "asc" }, take: 1 } },
    }),
  ]);
  if (!item) return { error: "That item no longer exists." };
  if (!song) return { error: "That song no longer exists." };

  const arrangement = song.arrangements[0];
  await prisma.planItem.update({
    where: { id: itemId },
    data: {
      title: song.title,
      songId: song.id,
      arrangementId: arrangement?.id ?? null,
      key: arrangement?.key ?? null,
      // Keep an empty slot's planned length when the song has none of its own. A song
      // being swapped takes its length and its tag with it.
      lengthSeconds: arrangement?.lengthSeconds ?? (item.songId ? null : item.lengthSeconds),
      tag: item.songId ? false : item.tag,
    },
  });
  revalidatePath(`/plans/${item.planId}`);
  revalidatePath("/plans/multi-view");
  return {};
}

export async function deletePlanItem(itemId: string): Promise<ActionResult> {
  const user = await requireRole("PLANNER");
  const item = await prisma.planItem.findFirst({
    where: { id: itemId, plan: { organizationId: user.organizationId } },
  });
  if (!item) return {};

  await prisma.planItem.delete({ where: { id: itemId } });
  revalidatePath(`/plans/${item.planId}`);
  revalidatePath("/plans/multi-view");
  return {};
}

// Saves the matrix after a drag: each plan named gets exactly the rows listed,
// in that order. A row may have come from another of the plans named.
export async function arrangePlans(changes: { planId: string; itemIds: string[] }[]): Promise<ActionResult> {
  const user = await requireRole("PLANNER");
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 20) return { error: "That couldn't be saved." };

  const planIds = [...new Set(changes.map((change) => String(change.planId)))];
  const plans = await prisma.plan.findMany({
    where: { id: { in: planIds }, organizationId: user.organizationId },
    select: { id: true, items: { select: { id: true } } },
  });
  if (planIds.length !== changes.length || plans.length !== planIds.length) return { error: "One of those plans no longer exists." };

  // The rows must be the same set these plans hold now: nothing lost, nothing brought in from elsewhere.
  const held = plans.flatMap((plan) => plan.items.map((item) => item.id)).sort();
  const wanted = changes.flatMap((change) => change.itemIds.map(String)).sort();
  if (held.length !== wanted.length || held.some((id, n) => id !== wanted[n])) {
    return { error: "The plans changed while you were dragging. Reload the page and try again." };
  }

  await prisma.$transaction(
    changes.flatMap((change) => change.itemIds.map((id, position) => prisma.planItem.update({ where: { id }, data: { planId: change.planId, position } })))
  );
  revalidatePath("/plans", "layout");
  return {};
}

// Copies a row into another plan (dragging across in the matrix), as the
// row at `index` there. The original is left where it was.
export async function copyPlanItem(itemId: string, toPlanId: string, index: number): Promise<ActionResult> {
  const user = await requireRole("PLANNER");
  const [item, plan] = await Promise.all([
    prisma.planItem.findFirst({ where: { id: itemId, plan: { organizationId: user.organizationId } } }),
    prisma.plan.findFirst({ where: { id: toPlanId, organizationId: user.organizationId }, include: { items: { orderBy: { position: "asc" }, select: { position: true } } } }),
  ]);
  if (!item) return { error: "That row no longer exists." };
  if (!plan) return { error: "That plan no longer exists." };

  const at = Number.isInteger(index) && index >= 0 ? index : plan.items.length;
  const position = plan.items[at]?.position ?? (plan.items.at(-1)?.position ?? -1) + 1;
  const { type, title, lengthSeconds, preService, tag, notes, key, songId, arrangementId } = item;
  await prisma.$transaction([
    prisma.planItem.updateMany({ where: { planId: plan.id, position: { gte: position } }, data: { position: { increment: 1 } } }),
    prisma.planItem.create({ data: { planId: plan.id, position, type, title, lengthSeconds, preService, tag, notes, key, songId, arrangementId } }),
  ]);
  revalidatePath("/plans", "layout");
  return {};
}

export type PlanItemSnapshot = {
  type: "SONG" | "ITEM" | "HEADER";
  title: string;
  lengthSeconds: number | null;
  preService: boolean;
  tag: boolean;
  notes: string | null;
  key: string | null;
  songId: string | null;
  arrangementId: string | null;
};

// Puts back a row that was just removed (the Undo on the plan page), straight
// after the row `afterId`, or first when that is null.
export async function restorePlanItem(planId: string, afterId: string | null, snapshot: PlanItemSnapshot): Promise<ActionResult> {
  const owned = await ownedPlan(planId);
  if (!owned) return { error: "That plan no longer exists." };
  if (!["SONG", "ITEM", "HEADER"].includes(snapshot.type) || !snapshot.title?.trim()) return { error: "That row couldn't be put back." };

  // Only a song and arrangement that are really this church's.
  const song = snapshot.songId
    ? await prisma.song.findFirst({ where: { id: snapshot.songId, organizationId: owned.user.organizationId }, include: { arrangements: { select: { id: true } } } })
    : null;
  const arrangementId = song?.arrangements.some((a) => a.id === snapshot.arrangementId) ? snapshot.arrangementId : null;

  const before = afterId ? await prisma.planItem.findFirst({ where: { id: afterId, planId } }) : null;
  const position = before ? before.position + 1 : afterId ? ((await prisma.planItem.findFirst({ where: { planId }, orderBy: { position: "desc" } }))?.position ?? -1) + 1 : 0;

  await prisma.$transaction([
    prisma.planItem.updateMany({ where: { planId, position: { gte: position } }, data: { position: { increment: 1 } } }),
    prisma.planItem.create({
      data: {
        planId,
        position,
        type: snapshot.type,
        title: snapshot.title.trim().slice(0, 200),
        lengthSeconds: snapshot.type === "HEADER" ? null : snapshot.lengthSeconds,
        preService: snapshot.type === "HEADER" && snapshot.preService === true,
        tag: snapshot.type === "SONG" && snapshot.tag === true,
        notes: snapshot.notes,
        key: snapshot.type === "SONG" ? snapshot.key : null,
        songId: song?.id ?? null,
        arrangementId,
      },
    }),
  ]);
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/plans/multi-view");
  return {};
}

export async function reorderPlanItems(planId: string, orderedIds: string[]): Promise<ActionResult> {
  const owned = await ownedPlan(planId);
  if (!owned) return { error: "That plan no longer exists." };

  const existing = await prisma.planItem.findMany({ where: { planId }, select: { id: true } });
  const known = new Set(existing.map((i) => i.id));
  if (orderedIds.length !== known.size || !orderedIds.every((id) => known.has(id))) {
    return { error: "The plan changed while you were dragging. Try again." };
  }

  await prisma.$transaction(
    orderedIds.map((id, position) => prisma.planItem.update({ where: { id }, data: { position } }))
  );
  revalidatePath(`/plans/${planId}`);
  return {};
}
