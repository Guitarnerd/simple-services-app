import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayInZone } from "@/lib/format";
import { sendScheduleEmails } from "@/lib/schedule";

const DAY = 24 * 60 * 60 * 1000;
// Nudge someone who hasn't answered this long after they were asked.
const NUDGE_AFTER_DAYS = 3;
// Remind confirmed people this many days before the service.
const HEADS_UP_DAYS = 3;

// Run once a day by a scheduler (see vercel.json). Each reminder is sent at
// most once per assignment. Protected by CRON_SECRET, which Vercel sends as a
// bearer token; without that variable set, the route refuses everyone.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not found", { status: 404 });
  }

  const totals = { nudged: 0, headsUp: 0, notConfigured: false };

  for (const org of await prisma.organization.findMany()) {
    const today = todayInZone(org.timezone);

    const unanswered = await prisma.assignment.findMany({
      where: {
        plan: { organizationId: org.id, date: { gte: today } },
        status: "PENDING",
        reminderSentAt: null,
        notifiedAt: { lte: new Date(Date.now() - NUDGE_AFTER_DAYS * DAY) },
      },
      select: { id: true },
    });
    const nudge = await sendScheduleEmails(
      unanswered.map((a) => a.id),
      "reminder"
    );

    const serving = await prisma.assignment.findMany({
      where: {
        plan: { organizationId: org.id, date: { gte: today, lte: new Date(today.getTime() + HEADS_UP_DAYS * DAY) } },
        status: "CONFIRMED",
        serviceReminderSentAt: null,
      },
      select: { id: true },
    });
    const headsUp = await sendScheduleEmails(
      serving.map((a) => a.id),
      "service"
    );

    totals.nudged += nudge.sent;
    totals.headsUp += headsUp.sent;
    totals.notConfigured ||= nudge.notConfigured || headsUp.notConfigured;
  }

  return Response.json(totals);
}
