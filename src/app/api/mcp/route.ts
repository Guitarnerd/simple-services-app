import { NextResponse, type NextRequest } from "next/server";
import { runAsUser, userForToken } from "@/lib/api-user";
import { TOOLS, ToolError, toolList } from "@/lib/mcp/tools";
import { CORS, originOf } from "@/lib/oauth";

// The Claude connection: a Model Context Protocol server over plain HTTP
// ("streamable HTTP", answered with JSON, no sessions). Claude signs in with
// "Authorization: Bearer ss_…": a token from the Account page (Claude Code), or
// one from the OAuth sign-in in src/lib/oauth.ts (claude.ai, the phone app).
// Every tool runs as that token's person.

export const dynamic = "force-dynamic";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Request = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const reply = (id: Request["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const failure = (id: Request["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(message: Request) {
  const { id, method, params } = message;
  switch (method) {
    case "initialize": {
      const asked = String(params?.protocolVersion ?? "");
      return reply(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "simple-services", version: "1.0.0" },
        instructions:
          "Simple Services is this church's service planning app: songs and chord charts, service plans, and scheduling volunteers. " +
          "Look things up (search_songs, list_plans, list_people, list_teams) to get ids before changing anything. " +
          "Edits change only the fields you give. Scheduling someone doesn't email them; send_schedule_requests and invite_person do, " +
          "and delete_plan can't be undone, so check with the user before using those. " +
          "Don't type out copyrighted lyrics from memory or the web into charts; charts come from the user.",
      });
    }
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: toolList() });
    case "tools/call": {
      const name = String(params?.name ?? "");
      const tool = TOOLS[name];
      if (!tool) return failure(id, -32602, `There's no tool called ${name}.`);
      const parsed = tool.input.safeParse(params?.arguments ?? {});
      if (!parsed.success) {
        return reply(id, { isError: true, content: [{ type: "text", text: `Those arguments don't fit: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` }] });
      }
      try {
        const result = await (tool.run as (args: unknown) => Promise<unknown>)(parsed.data);
        return reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 1) }] });
      } catch (error) {
        if (error instanceof ToolError) return reply(id, { isError: true, content: [{ type: "text", text: error.message }] });
        console.error(`Claude connection: ${name} failed`, error);
        return reply(id, { isError: true, content: [{ type: "text", text: "Something went wrong in the app while doing that." }] });
      }
    }
    default:
      // Notifications (no id) need no answer.
      return id === undefined ? null : failure(id, -32601, `Unknown method ${method}.`);
  }
}

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  const user = token ? await userForToken(token) : null;
  if (!user) {
    // Points OAuth clients at the sign-in (RFC 9728).
    return NextResponse.json(failure(null, -32001, "Sign in to Simple Services to use this connection."), {
      status: 401,
      headers: { ...CORS, "WWW-Authenticate": `Bearer resource_metadata="${originOf(request)}/.well-known/oauth-protected-resource"` },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(failure(null, -32700, "That isn't JSON."), { status: 400 });
  }

  const messages = (Array.isArray(body) ? body : [body]) as Request[];
  const answers = (await runAsUser(user, () => Promise.all(messages.map(handle)))).filter((a) => a !== null);
  if (answers.length === 0) return new NextResponse(null, { status: 202, headers: CORS });
  return NextResponse.json(Array.isArray(body) ? answers : answers[0], { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// No server-to-client stream: everything is answered in the POST.
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
