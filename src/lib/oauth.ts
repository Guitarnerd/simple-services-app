import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/api-user";

// Signing Claude in from claude.ai and the Claude phone app, which connect with
// OAuth rather than a pasted token (the MCP authorization spec):
//   1. Claude reads /.well-known/oauth-protected-resource and
//      /.well-known/oauth-authorization-server to find the endpoints below.
//   2. It registers itself at /oauth/register (dynamic client registration).
//   3. The person is sent to /oauth/authorize, signs in if needed, and presses Allow.
//   4. Claude swaps the one-time code for tokens at /oauth/token (PKCE, S256).
// The access token it gets is an ordinary ApiToken row, so it shows on the
// Account page with the others and is removed the same way.

export const ACCESS_TOKEN_DAYS = 30;
export const REFRESH_TOKEN_DAYS = 365;
export const CODE_MINUTES = 5;

// The address the app was reached at, so the metadata matches whichever domain Claude used.
export function originOf(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}`;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...headers } });
}

export function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status);
}

// Where a client may send people back to: https anywhere, or http on this computer for testing.
export function allowedRedirect(uri: string) {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function randomToken(prefix: string) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

// PKCE: the verifier Claude kept must hash to the challenge it sent at the start.
export function pkceMatches(verifier: string, challenge: string) {
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

// A fresh access and refresh token for a person, saved as a Claude connection.
export async function issueTokens(personId: string, clientId: string, clientName: string, replacing?: string) {
  const access = randomToken("ss_");
  const refresh = randomToken("ssr_");
  const data = {
    tokenHash: hashToken(access),
    refreshHash: hashToken(refresh),
    hint: access.slice(-4),
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_DAYS * 86_400_000),
    refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000),
  };
  if (replacing) {
    await prisma.apiToken.update({ where: { id: replacing }, data });
  } else {
    await prisma.apiToken.create({ data: { ...data, personId, clientId, name: clientName } });
  }
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_DAYS * 86_400,
    refresh_token: refresh,
    scope: "mcp",
  };
}
