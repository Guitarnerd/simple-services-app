import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSetup: string | undefined;
};

const DEVELOPMENT = process.env.NODE_ENV !== "production";
const LOCAL_DATABASE = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL ?? "");

// The local database (`prisma dev`) is a single session behind its port. Two
// connections talking to it at once get their messages crossed ("bind message
// supplies 2 parameters, but prepared statement requires 6", or the connection
// dropping), so against it the app uses one connection and queries take turns.
// That includes a production build run locally for testing (`next start`).
const DEV_POOL = DEVELOPMENT || LOCAL_DATABASE ? { max: 1 } : {};
// What the kept client was made with. If the address changes, a new one is made.
const SETUP = JSON.stringify([DEV_POOL, process.env.DATABASE_URL]);

function createClient() {
  // A developer's computer must never work on the live data by accident. The
  // Vercel command-line tool writes a .env.local holding the hosted database's
  // address, and `next dev` reads that file ahead of .env.
  if (DEVELOPMENT && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL ?? "") && process.env.ALLOW_HOSTED_DATABASE !== "1") {
    throw new Error(
      "DATABASE_URL points at a database that isn't on this computer. If a .env.local file appeared (the Vercel tool writes one), delete it. To use a hosted database on purpose, set ALLOW_HOSTED_DATABASE=1."
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, ...DEV_POOL }) });
}

// In development the client is kept across hot reloads. The instanceof check
// drops a client left over from before `prisma generate` last ran, so a
// migration doesn't require restarting the dev server; the setup check does
// the same when the settings above change.
export const prisma = globalForPrisma.prisma instanceof PrismaClient && globalForPrisma.prismaSetup === SETUP ? globalForPrisma.prisma : createClient();

if (DEVELOPMENT) {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSetup = SETUP;
}
