import type { NextRequest } from "next/server";
import { CORS, json, originOf } from "@/lib/oauth";

// RFC 9728: tells Claude that /api/mcp is signed into through this app's own
// OAuth server. Also answers at /.well-known/oauth-protected-resource/api/mcp.
export function GET(request: NextRequest) {
  const origin = originOf(request);
  return json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
    resource_name: "Simple Services",
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
