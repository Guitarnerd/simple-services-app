import type { NextRequest } from "next/server";
import { CORS, json, originOf } from "@/lib/oauth";

// RFC 8414: where Claude registers, sends the person to approve, and gets tokens.
export function GET(request: NextRequest) {
  const origin = originOf(request);
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
