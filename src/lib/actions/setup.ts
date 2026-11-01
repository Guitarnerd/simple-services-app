"use server";

import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { getSession } from "@/lib/session";
import { sendEmail, testEmail } from "@/lib/email";
import { PcoError, pcoPage, pcoPreview, type PcoLogin, type PcoPreview } from "@/lib/pco";
import { readContact } from "@/lib/pco-contact";
import type { Prisma } from "@/generated/prisma/client";
import { STARTER_SERVICE_TYPE, STARTER_TEAMS } from "@/lib/starter";
import type { FormState } from "@/components/form";

const MIN_PASSWORD = 8;

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function sameCode(given: string, expected: string) {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(given), hash(expected));
}

function validZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// The first visit to a new site: makes the church and its first admin, and signs them
// in. Only works while there's no church, and with the code set when the site was made,
// so a stranger who finds a new site can't claim it.
export async function createChurch(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = process.env.SETUP_CODE;
  if (!code) return { error: "This site has no SETUP_CODE yet. Add one in Vercel under Settings → Environment Variables, then redeploy." };
  if ((await prisma.organization.count()) > 0) return { error: "This site is already set up." };
  if (!sameCode(field(formData, "code"), code)) return { error: "That setup code isn't right." };

  const name = field(formData, "church");
  const timezone = field(formData, "timezone");
  const firstName = field(formData, "firstName");
  const lastName = field(formData, "lastName");
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name) return { error: "Give your church's name." };
  if (!validZone(timezone)) return { error: "Pick a time zone." };
  if (!firstName || !lastName) return { error: "Give your first and last name." };
  if (!z.email().safeParse(email).success) return { error: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters for your password.` };
  if (password !== String(formData.get("confirm") ?? "")) return { error: "Those passwords don't match." };

  const starter = formData.has("starter");
  const person = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name, timezone } });
    if (starter) {
      for (const [sortOrder, team] of STARTER_TEAMS.entries()) {
        await tx.team.create({
          data: { organizationId: organization.id, name: team.name, sortOrder, positions: { create: team.positions.map((position, order) => ({ name: position, sortOrder: order })) } },
        });
      }
      await tx.serviceType.create({ data: { organizationId: organization.id, name: STARTER_SERVICE_TYPE } });
    }
    return tx.person.create({ data: { organizationId: organization.id, firstName, lastName, email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10), lastLoginAt: new Date() } });
  });

  const session = await getSession();
  session.personId = person.id;
  await session.save();
  redirect("/getting-started");
}

export async function sendSetupTestEmail(): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const person = await prisma.person.findFirst({ where: { id: user.id, organizationId: user.organizationId }, select: { email: true, organization: { select: { name: true } } } });
  if (!person?.email) return { error: "Your own profile has no email address." };
  try {
    const { sent } = await sendEmail({ to: person.email, ...testEmail(person.organization.name) });
    return sent ? { ok: `Sent to ${person.email}. Check that it arrives, and look in spam.` } : { error: "Email isn't set up yet, so nothing was sent." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That couldn't be sent." };
  }
}

export type PcoPreviewState = { error?: string; preview?: PcoPreview } | undefined;

// The token is used for this one look at Planning Center and then forgotten.
export async function previewPlanningCenter(_prev: PcoPreviewState, formData: FormData): Promise<PcoPreviewState> {
  await requireRole("ADMIN");
  const appId = field(formData, "appId");
  const secret = field(formData, "secret");
  if (!appId || !secret) return { error: "Paste in both the Application ID and the Secret." };
  try {
    return { preview: await pcoPreview({ appId, secret }) };
  } catch (error) {
    if (error instanceof PcoError) return { error: error.message };
    throw error;
  }
}

export type PeopleStep = { phase: "roster" | "details"; offset: number };
export type PeopleResult = { error?: string; next?: PeopleStep | null; handled?: number; total?: number; added?: number; updated?: number; sharedEmails?: number };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

// One page of bringing people across, so a big church can't outlast a web request. The
// browser calls this until `next` is null, showing progress. First everyone in Planning
// Center Services is made here by name, then the church's directory is walked for their
// details. It can run again safely: each person keeps their Planning Center id, details
// fill in only what's blank here, and someone with a login keeps their own name. Nobody
// is emailed, and the token isn't kept.
export async function importPlanningCenterPeople(login: PcoLogin, step: PeopleStep): Promise<PeopleResult> {
  const user = await requireRole("ADMIN");
  const organizationId = user.organizationId;
  const offset = Math.max(0, Math.floor(step.offset) || 0);

  try {
    if (step.phase === "roster") {
      const page = await pcoPage(login, "/services/v2/people", offset);
      const known = await prisma.person.findMany({ where: { organizationId, pcoId: { in: page.rows.map((row) => row.id) } }, select: { pcoId: true } });
      const have = new Set(known.map((person) => person.pcoId));
      const fresh = page.rows.filter((row) => !have.has(row.id));
      await prisma.person.createMany({
        data: fresh.map((row) => ({
          organizationId,
          pcoId: row.id,
          firstName: text(row.attributes.first_name) ?? "?",
          lastName: text(row.attributes.last_name) ?? "",
          archived: Boolean(row.attributes.archived_at) || text(row.attributes.status) === "inactive",
        })),
      });
      return { next: page.next === null ? { phase: "details", offset: 0 } : { phase: "roster", offset: page.next }, handled: offset + page.rows.length, total: page.total, added: fresh.length };
    }

    const page = await pcoPage(login, "/people/v2/people?include=emails,phone_numbers,addresses", offset);
    const people = await prisma.person.findMany({ where: { organizationId, pcoId: { in: page.rows.map((row) => row.id) } }, include: { phones: { select: { id: true } } } });
    let updated = 0;
    let sharedEmails = 0;

    for (const person of people) {
      const row = page.rows.find((candidate) => candidate.id === person.pcoId);
      if (!row) continue;
      const contact = readContact(row, page.included);

      let target: { id: string; birthday: Date | null; street: string | null; phones: unknown[] } = person;
      const data: Prisma.PersonUncheckedUpdateInput = {};

      if (!person.email && contact.email) {
        const owner = await prisma.person.findUnique({ where: { email: contact.email }, include: { phones: { select: { id: true } } } });
        if (!owner) data.email = contact.email;
        else if (owner.organizationId === organizationId && !owner.pcoId) {
          // Already here under that email, such as the admin who set the site up. One
          // person, so the name-only row just made goes and this one takes over.
          await prisma.person.delete({ where: { id: person.id } });
          data.pcoId = person.pcoId;
          target = owner;
        } else sharedEmails++; // A family sharing an address: an email can belong to one person only.
      }

      // Filled in only where it's blank, so nothing changed here is overwritten.
      if (!target.birthday && contact.birthday) data.birthday = contact.birthday;
      if (!target.street && contact.street) Object.assign(data, { street: contact.street, city: contact.city, state: contact.state, postalCode: contact.postalCode });

      if (Object.keys(data).length > 0) await prisma.person.update({ where: { id: target.id }, data });
      if (target.phones.length === 0 && contact.phones.length > 0) await prisma.phone.createMany({ data: contact.phones.map((phone) => ({ ...phone, personId: target.id })) });
      updated++;
    }

    return { next: page.next === null ? null : { phase: "details", offset: page.next }, handled: offset + page.rows.length, total: page.total, updated, sharedEmails };
  } catch (error) {
    if (error instanceof PcoError) return { error: error.message };
    throw error;
  }
}
