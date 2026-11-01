import type { NextRequest } from "next/server";
import { getOptionalUser } from "@/lib/dal";
import { hasRole } from "@/lib/roles";
import { ccliUsage, readDay } from "@/lib/ccli";

// A spreadsheet cell: quoted, and never starting with a character a spreadsheet would run as a formula.
const cell = (value: string | number | null) => {
  const text = String(value ?? "");
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

// The CCLI report as a spreadsheet file, for the same dates as the page.
export async function GET(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user || !hasRole(user.role, "PLANNER")) return new Response("Not found", { status: 404 });

  const from = readDay(request.nextUrl.searchParams.get("from") ?? undefined);
  const to = readDay(request.nextUrl.searchParams.get("to") ?? undefined);
  if (!from || !to) return new Response("Pick a start and an end date.", { status: 400 });

  // Only what gets reported: songs with a CCLI number.
  const rows = (await ccliUsage(user.organizationId, from, to)).filter((row) => row.ccliNumber);
  const lines = [
    ["CCLI song number", "Title", "Authors", "Times used", "Dates used"].map(cell).join(","),
    ...rows.map((row) => [row.ccliNumber, row.title, row.author, row.uses, row.dates.join(" ")].map(cell).join(",")),
  ];
  const name = `ccli-report-${request.nextUrl.searchParams.get("from")}-to-${request.nextUrl.searchParams.get("to")}.csv`;
  // The leading mark tells Excel the file is UTF-8, so accented names survive.
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
