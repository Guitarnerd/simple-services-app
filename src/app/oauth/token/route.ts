import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/api-user";
import { CORS, issueTokens, json, oauthError, pkceMatches } from "@/lib/oauth";

// Swaps a one-time code (with its PKCE verifier) or a refresh token for tokens.
export async function POST(request: NextRequest) {
  let params: URLSearchParams;
  const type = request.headers.get("content-type") ?? "";
  try {
    params = type.includes("application/json") ? new URLSearchParams(Object.entries(await request.json()).map(([k, v]) => [k, String(v)])) : new URLSearchParams(await request.text());
  } catch {
    return oauthError("invalid_request", "That request couldn't be read.");
  }
  const grant = params.get("grant_type");

  if (grant === "authorization_code") {
    const code = params.get("code") ?? "";
    const row = code ? await prisma.oAuthCode.findUnique({ where: { codeHash: hashToken(code) }, include: { client: true } }) : null;
    // A code works once: it is gone whether or not the rest checks out.
    if (row) await prisma.oAuthCode.delete({ where: { id: row.id } });
    await prisma.oAuthCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    if (!row || row.expiresAt < new Date()) return oauthError("invalid_grant", "That code has expired or was already used.");
    if (params.get("client_id") && params.get("client_id") !== row.clientId) return oauthError("invalid_grant", "That code belongs to another client.");
    if ((params.get("redirect_uri") ?? row.redirectUri) !== row.redirectUri) return oauthError("invalid_grant", "The redirect address doesn't match.");
    if (!pkceMatches(params.get("code_verifier") ?? "", row.codeChallenge)) return oauthError("invalid_grant", "The code verifier doesn't match.");

    return json(await issueTokens(row.personId, row.clientId, row.client.name));
  }

  if (grant === "refresh_token") {
    const refresh = params.get("refresh_token") ?? "";
    const row = refresh ? await prisma.apiToken.findUnique({ where: { refreshHash: hashToken(refresh) } }) : null;
    if (!row || !row.refreshExpiresAt || row.refreshExpiresAt < new Date()) return oauthError("invalid_grant", "Sign in again: that refresh token has expired or was removed.");
    if (params.get("client_id") && row.clientId && params.get("client_id") !== row.clientId) return oauthError("invalid_grant", "That refresh token belongs to another client.");
    // The refresh token changes each time it is used.
    return json(await issueTokens(row.personId, row.clientId ?? "", row.name, row.id));
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
