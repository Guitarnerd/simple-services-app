import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { churchChecks, siteChecks, stepsLeft, type SetupCheck } from "@/lib/setup-checks";
import { Page } from "@/components/page";
import { Icon } from "@/components/ui";
import { TestEmailButton } from "./test-email-button";

export const metadata: Metadata = { title: "Getting started" };

function Check({ check, children }: { check: SetupCheck; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${check.done ? "bg-green-600 text-white" : "border border-neutral-400 dark:border-neutral-500"}`}>
        {check.done && "✓"}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="text-sm font-semibold">
          {check.title}
          <span className="sr-only">{check.done ? " (done)" : " (still to do)"}</span>
          {check.optional && <span className="muted font-normal"> (optional)</span>}
        </h3>
        <p className="muted text-sm">{check.summary}</p>
        {check.link && (
          <Link href={check.link.href} className="link w-fit text-sm">
            {check.link.label}
          </Link>
        )}
        {check.steps && (
          // Open while it's still to do; once it's done it's only there for reference.
          <details open={!check.done} className="text-sm">
            <summary className="cursor-pointer font-medium">How to do this</summary>
            <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-5">
              {check.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        )}
        {children}
      </div>
    </li>
  );
}

// What's left in setting up a church's site. Everything here is worked out afresh, so
// a step ticks itself off once it's done.
export default async function GettingStartedPage() {
  const user = await requireRole("ADMIN");
  const organizationId = user.organizationId;
  const [org, teamsWithPositions, serviceTypesWithPositions, songs, plans, imported, people, logins] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, logoUpdatedAt: true, ccliLicense: true } }),
    prisma.team.count({ where: { organizationId, positions: { some: {} } } }),
    prisma.serviceType.count({ where: { organizationId, templatePositions: { some: {} } } }),
    prisma.song.count({ where: { organizationId } }),
    prisma.plan.count({ where: { organizationId } }),
    prisma.person.count({ where: { organizationId, pcoId: { not: null } } }),
    prisma.person.count({ where: { organizationId, archived: false } }),
    prisma.person.count({ where: { organizationId, archived: false, passwordHash: { not: null } } }),
  ]);

  const facts = {
    emailKey: Boolean(process.env.RESEND_API_KEY),
    emailFrom: Boolean(process.env.EMAIL_FROM),
    appUrl: process.env.APP_URL ?? null,
    fileStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    reminders: Boolean(process.env.CRON_SECRET),
    logo: Boolean(org.logoUpdatedAt),
    ccliLicense: Boolean(org.ccliLicense),
    teamsWithPositions,
    serviceTypesWithPositions,
    songs,
    plans,
    imported,
    people,
    logins,
  };
  const site = siteChecks(facts);
  const church = churchChecks(facts);
  const left = stepsLeft(site) + stepsLeft(church);

  return (
    <Page title="Getting started" subtitle={left === 0 ? `${org.name} is all set up.` : `${left} ${left === 1 ? "step" : "steps"} left to set up ${org.name}.`} back={{ href: "/account", label: "Account" }}>
      <section className="panel">
        <h2 className="panel-head">Your church</h2>
        <div className="panel-body">
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {church.map((check) => (
              <Check key={check.id} check={check} />
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-head">Your site</h2>
        <div className="panel-body flex flex-col gap-3">
          <p className="muted flex items-start gap-2 text-sm">
            <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0" />
            These are set in your Vercel account. After changing a setting there, open Deployments and choose Redeploy, or it won&apos;t take effect.
          </p>
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {site.map((check) => (
              <Check key={check.id} check={check}>
                {check.id === "email" && check.done && <TestEmailButton />}
              </Check>
            ))}
          </ul>
        </div>
      </section>
    </Page>
  );
}
