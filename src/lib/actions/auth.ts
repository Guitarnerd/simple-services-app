"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getCurrentUser } from "@/lib/dal";
import { createTokenUrl, findValidToken } from "@/lib/tokens";
import { resetEmail, sendEmail } from "@/lib/email";
import type { FormState } from "@/components/form";

const MIN_PASSWORD = 8;

// Compared against when the email is unknown, so both paths take the same time.
const DUMMY_HASH = bcrypt.hashSync("no-such-account", 10);

// After this many wrong passwords for one email, sign-in for it pauses.
const MAX_TRIES = 8;
const LOCK_MINUTES = 15;

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  const tries = await prisma.loginAttempt.count({ where: { email, createdAt: { gte: since } } });
  if (tries >= MAX_TRIES) return { error: `Too many tries. Wait ${LOCK_MINUTES} minutes, or use "Forgot your password?".` };

  const person = await prisma.person.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, person?.passwordHash ?? DUMMY_HASH);
  if (!person || !person.passwordHash || person.archived || !valid) {
    // Counted whether or not the email belongs to anyone, so the answer gives nothing away.
    await prisma.loginAttempt.create({ data: { email: email.slice(0, 200) } });
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } });
    return { error: "That email and password don't match." };
  }
  await prisma.loginAttempt.deleteMany({ where: { email } });

  await prisma.person.update({
    where: { id: person.id },
    data: { lastLoginAt: new Date() },
  });

  const session = await getSession();
  session.personId = person.id;
  await session.save();

  redirect(safeNext(formData.get("next")));
}

// Only somewhere on this site ("/oauth/authorize?…"), never another site.
function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { error: "Enter a valid email address." };

  const person = await prisma.person.findUnique({ where: { email } });
  if (person && !person.archived && person.passwordHash) {
    const url = await createTokenUrl(person.id, "RESET");
    await sendEmail({ to: email, ...resetEmail(person.firstName, url) });
  }

  // Same answer whether or not the account exists.
  return { ok: "If that email has a login, a reset link is on its way." };
}

function checkNewPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  if (password !== confirm) return { error: "Those passwords don't match." };
  return { password };
}

// Used by both invitation and reset links.
export async function setPasswordWithToken(_prev: FormState, formData: FormData): Promise<FormState> {
  const checked = checkNewPassword(formData);
  if ("error" in checked) return checked;

  const record = await findValidToken(String(formData.get("token") ?? ""));
  if (!record) return { error: "This link has expired or was already used. Ask for a new one." };

  await prisma.$transaction([
    prisma.person.update({
      where: { id: record.personId },
      data: {
        passwordHash: await bcrypt.hash(checked.password, 10),
        lastLoginAt: new Date(),
      },
    }),
    prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  const session = await getSession();
  session.personId = record.personId;
  await session.save();

  redirect("/");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const person = await prisma.person.findUniqueOrThrow({ where: { id: user.id } });

  const current = String(formData.get("current") ?? "");
  if (!(await bcrypt.compare(current, person.passwordHash ?? DUMMY_HASH))) {
    return { error: "Your current password isn't right." };
  }

  const checked = checkNewPassword(formData);
  if ("error" in checked) return checked;

  await prisma.person.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(checked.password, 10) },
  });
  return { ok: "Password changed." };
}
