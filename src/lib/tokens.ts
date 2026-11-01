import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { TokenType } from "@/generated/prisma/client";

const LIFETIME_MS: Record<TokenType, number> = {
  INVITE: 7 * 24 * 60 * 60 * 1000,
  RESET: 60 * 60 * 1000,
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Replaces any outstanding link of the same type and returns the new URL.
export async function createTokenUrl(personId: string, type: TokenType) {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { personId, type, usedAt: null } }),
    prisma.authToken.create({
      data: {
        personId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + LIFETIME_MS[type]),
      },
    }),
  ]);
  return `${process.env.APP_URL}/set-password?token=${token}`;
}

export async function findValidToken(token: string) {
  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { person: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;
  if (record.person.archived) return null;
  return record;
}
