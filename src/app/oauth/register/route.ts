import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { allowedRedirect, CORS, json, oauthError } from "@/lib/oauth";

// RFC 7591 dynamic client registration: Claude introduces itself and the
// addresses it may be sent back to. Registering grants nothing by itself; a
// person still has to sign in and press Allow.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "Send the registration as JSON.");
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (redirectUris.length === 0 || redirectUris.length > 10 || !redirectUris.every(allowedRedirect)) {
    return oauthError("invalid_redirect_uri", "Give one or more https redirect addresses.");
  }
  const name = String(body.client_name ?? "Claude").slice(0, 80) || "Claude";

  const client = await prisma.oAuthClient.create({ data: { name, redirectUris } });
  return json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
