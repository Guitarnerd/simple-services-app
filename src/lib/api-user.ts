import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";

// The person a Claude connection token belongs to. While a request from Claude
// is being handled, `getCurrentUser()` returns this person instead of reading the
// sign-in cookie, so every existing permission check applies unchanged.
export type ApiUser = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: Role;
  leadsTeamIds: string[];
};

const store = new AsyncLocalStorage<ApiUser>();

export function currentApiUser() {
  return store.getStore() ?? null;
}

export function runAsUser<T>(user: ApiUser, fn: () => Promise<T>) {
  return store.run(user, fn);
}

// Tokens are shown once and stored only as a hash.
export function newToken() {
  const token = `ss_${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token), hint: token.slice(-4) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// The person a token signs in as, under the same rules as signing in: they must
// still have a login and not be archived.
export async function userForToken(token: string): Promise<ApiUser | null> {
  if (!token.startsWith("ss_")) return null;
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { person: { include: { leading: { select: { teamId: true } } } } },
  });
  const person = row?.person;
  if (!row || !person || person.archived || !person.passwordHash) return null;
  // OAuth access tokens run out and are renewed; tokens made on the Account page don't.
  if (row.expiresAt && row.expiresAt < new Date()) return null;

  // Recorded at most once a minute, so a busy conversation doesn't write on every call.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }

  return {
    id: person.id,
    organizationId: person.organizationId,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    role: person.role as Role,
    leadsTeamIds: person.leading.map((l) => l.teamId),
  };
}
