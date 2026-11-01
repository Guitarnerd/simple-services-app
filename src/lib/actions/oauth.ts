"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hashToken } from "@/lib/api-user";
import { CODE_MINUTES, randomToken } from "@/lib/oauth";

async function request(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const redirectUri = String(formData.get("redirectUri") ?? "");
  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  // Only ever send someone back to an address the client registered.
  if (!client || !client.redirectUris.includes(redirectUri)) redirect("/");
  return { client, redirectUri, state: String(formData.get("state") ?? ""), codeChallenge: String(formData.get("codeChallenge") ?? "") };
}

function back(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value);
  redirect(url.toString());
}

// "Allow": a one-time code, good for a few minutes, that Claude swaps for tokens.
export async function approveConnection(formData: FormData) {
  const user = await getCurrentUser();
  const { client, redirectUri, state, codeChallenge } = await request(formData);
  if (!codeChallenge) redirect("/");

  const code = randomToken("ssc_");
  await prisma.oAuthCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: client.id,
      personId: user.id,
      redirectUri,
      codeChallenge,
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    },
  });
  back(redirectUri, { code, state });
}

export async function denyConnection(formData: FormData) {
  await getCurrentUser();
  const { redirectUri, state } = await request(formData);
  back(redirectUri, { error: "access_denied", state });
}
