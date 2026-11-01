"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canEditPerson, canManageTeam, getCurrentUser, requireRole } from "@/lib/dal";
import { hasRole, ROLES } from "@/lib/roles";
import { createTokenUrl } from "@/lib/tokens";
import { emailConfigured, inviteEmail, sendEmail } from "@/lib/email";
import { deleteFile } from "@/lib/storage";
import type { FormState } from "@/components/form";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

const PersonSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || z.email().safeParse(v).success, "That email address doesn't look right."),
  birthday: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "That birthday isn't a valid date."),
  street: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
});

function readPhones(formData: FormData) {
  const labels = formData.getAll("phoneLabel").map(String);
  const numbers = formData.getAll("phoneNumber").map(String);
  const primaryIndex = Number(formData.get("phonePrimary") ?? 0);

  const phones = numbers
    .map((number, i) => ({
      number: number.trim(),
      label: labels[i]?.trim() || "Mobile",
      isPrimary: i === primaryIndex,
    }))
    .filter((p) => p.number !== "");

  if (phones.length > 0 && !phones.some((p) => p.isPrimary)) phones[0].isPrimary = true;
  return phones;
}

export async function savePerson(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "") || null;

  if (id ? !canEditPerson(user, id) : !hasRole(user.role, "PLANNER")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = PersonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { birthday, ...fields } = parsed.data;

  if (fields.email) {
    const taken = await prisma.person.findUnique({ where: { email: fields.email } });
    if (taken && taken.id !== id) return { error: `${fields.email} already belongs to ${taken.firstName} ${taken.lastName}.` };
  }

  const data = {
    ...fields,
    birthday: birthday ? new Date(birthday) : null,
    // Notes are for planners; a member editing their own profile can't see or change them.
    ...(hasRole(user.role, "PLANNER") ? { notes: String(formData.get("notes") ?? "").trim() || null } : {}),
  };
  const phones = readPhones(formData);

  if (!id) {
    const person = await prisma.person.create({
      data: { ...data, organizationId: user.organizationId, phones: { create: phones } },
    });
    redirect(`/people/${person.id}`);
  }

  const existing = await prisma.person.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return { error: "That person no longer exists." };
  if (existing.passwordHash && !data.email) {
    return { error: "This person signs in with their email, so it can't be blank." };
  }

  await prisma.$transaction([
    prisma.phone.deleteMany({ where: { personId: id } }),
    prisma.person.update({ where: { id }, data: { ...data, phones: { create: phones } } }),
  ]);

  revalidatePath(`/people/${id}`);
  return { ok: "Saved." };
}

// Replaces the person's positions, but only within teams the current user manages.
export async function savePositions(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const personId = String(formData.get("personId") ?? "");

  const [person, positions] = await Promise.all([
    prisma.person.findFirst({ where: { id: personId, organizationId: user.organizationId } }),
    prisma.position.findMany({ where: { team: { organizationId: user.organizationId } } }),
  ]);
  if (!person) return { error: "That person no longer exists." };

  const manageable = positions.filter((p) => canManageTeam(user, p.teamId)).map((p) => p.id);
  if (manageable.length === 0) return { error: "You don't have permission to do that." };

  const selected = formData.getAll("positionId").map(String).filter((pid) => manageable.includes(pid));

  await prisma.$transaction([
    prisma.personPosition.deleteMany({ where: { personId, positionId: { in: manageable } } }),
    prisma.personPosition.createMany({
      data: selected.map((positionId) => ({ personId, positionId })),
    }),
  ]);

  revalidatePath(`/people/${personId}`);
  return { ok: "Positions saved." };
}

export async function saveRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const personId = String(formData.get("personId") ?? "");
  const role = z.enum(ROLES).safeParse(formData.get("role"));
  if (!role.success) return { error: "Pick a permission level." };

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  });
  if (!person) return { error: "That person no longer exists." };

  if (person.role === "ADMIN" && role.data !== "ADMIN") {
    const otherAdmins = await prisma.person.count({
      where: {
        organizationId: user.organizationId,
        role: "ADMIN",
        archived: false,
        passwordHash: { not: null },
        id: { not: personId },
      },
    });
    if (otherAdmins === 0) return { error: "There has to be at least one admin who can sign in." };
  }

  await prisma.person.update({ where: { id: personId }, data: { role: role.data } });
  revalidatePath(`/people/${personId}`);
  return { ok: "Permission level saved." };
}

export async function sendInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const personId = String(formData.get("personId") ?? "");

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
    include: { organization: true },
  });
  if (!person) return { error: "That person no longer exists." };
  if (!person.email) return { error: "Add an email address first." };
  if (person.archived) return { error: "This person is archived." };

  const url = await createTokenUrl(person.id, "INVITE");
  await sendEmail({ to: person.email, ...inviteEmail(person.firstName, person.organization.name, url) });
  await prisma.person.update({ where: { id: person.id }, data: { invitedAt: new Date() } });

  revalidatePath(`/people/${personId}`);
  if (!emailConfigured()) {
    return { ok: "Email isn't set up yet, so nothing was sent. Share this link with them instead:", link: url };
  }
  return { ok: `Invitation sent to ${person.email}.` };
}

export async function setArchived(formData: FormData) {
  const user = await requireRole("PLANNER");
  const personId = String(formData.get("personId") ?? "");
  const archived = formData.get("archived") === "true";
  if (personId === user.id) return;

  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
  });
  // Only admins can archive another admin.
  if (!person || (person.role === "ADMIN" && user.role !== "ADMIN")) return;

  await prisma.person.update({ where: { id: personId }, data: { archived } });
  revalidatePath(`/people/${personId}`);
}

// Clears everything marked as sample data (test people, songs and plans) in
// one go. Admins only. Teams and service types are left alone.
export async function removeSampleData() {
  const user = await requireRole("ADMIN");
  const where = { organizationId: user.organizationId, sample: true };

  // Uploaded files of sample songs go too.
  const files = await prisma.attachment.findMany({ where: { song: where, storageKey: { not: null } }, select: { storageKey: true } });

  // Plans first: their rows and scheduling go with them.
  await prisma.plan.deleteMany({ where });
  await prisma.song.deleteMany({ where });
  // Never the person doing this, or anyone who can sign in.
  await prisma.person.deleteMany({ where: { ...where, id: { not: user.id }, passwordHash: null } });

  await Promise.all(files.map((file) => deleteFile(file.storageKey as string).catch(() => {})));
  revalidatePath("/", "layout");
}
