import { NextResponse, type NextRequest } from "next/server";
import { getIronSession, nextProxyCookies } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

const PUBLIC_ROUTES = new Set(["/login", "/setup", "/forgot-password", "/set-password", "/sw.js"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Schedule email links carry their own signature, the reminder job its own secret,
  // and the Claude connection its own token (and the OAuth endpoints that issue it).
  const isPublicRoute =
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith("/respond/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/mcp" ||
    pathname.startsWith("/.well-known/") ||
    pathname === "/oauth/register" ||
    pathname === "/oauth/token";

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    nextProxyCookies(request, response),
    sessionOptions
  );

  if (!isPublicRoute && !session.personId) {
    const login = new URL("/login", request.url);
    // Back to the page they were going to after signing in (a Claude approval page, say).
    if (request.method === "GET" && pathname !== "/") login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico|webmanifest)$).*)"],
};
