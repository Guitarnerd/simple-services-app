import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/roles";
import { Page } from "@/components/page";
import { Blackouts } from "@/components/blackouts";
import { ServingPreferences } from "@/components/serving";
import { ChangePasswordForm } from "./change-password-form";
import { LogoutButton } from "@/components/nav";
import { SubmitButton } from "@/components/form";
import { removeSampleData } from "@/lib/actions/people";
import { revokeApiToken } from "@/lib/actions/tokens";
import { NewConnectionForm } from "./claude-connection";
import { ChurchLogoForm } from "./church-logo";
import { PalettePicker } from "@/components/palette-picker";
import { ThemeToggle } from "@/components/nav";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { name: true, timezone: true, logoUpdatedAt: true } });
  const positions = await prisma.personPosition.findMany({
    where: { personId: user.id },
    include: { position: { include: { team: true } } },
  });
  const preferences = await prisma.person.findUniqueOrThrow({ where: { id: user.id }, select: { maxPerMonth: true, preferredWeeks: true } });
  const marked = { organizationId: user.organizationId, sample: true };
  const sample = { people: await prisma.person.count({ where: marked }), songs: await prisma.song.count({ where: marked }), plans: await prisma.plan.count({ where: marked }) };
  const connections = await prisma.apiToken.findMany({ where: { personId: user.id }, orderBy: { createdAt: "desc" } });
  const appUrl = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
  positions.sort((a, b) => a.position.team.sortOrder - b.position.team.sortOrder || a.position.sortOrder - b.position.sortOrder);

  return (
    <Page title="Account" subtitle={user.email}>
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Appearance</h2>
            <p className="muted text-sm">Colours for this device. Everyone can pick their own.</p>
          </div>
          <ThemeToggle className="btn btn-secondary" label />
        </div>
        <PalettePicker />
      </section>

      {user.role === "ADMIN" && (
        <section className="card">
          <h2 className="font-semibold">Church logo</h2>
          <p className="muted mb-3 text-sm">Shown at the top left for everyone at {org.name}. A square picture works best.</p>
          <ChurchLogoForm logoVersion={org.logoUpdatedAt ? String(org.logoUpdatedAt.getTime()) : null} />
        </section>
      )}

      <section className="card">
        <h2 className="font-semibold">
          {user.firstName} {user.lastName}
        </h2>
        <p className="muted mb-3 text-sm">
          {ROLE_LABELS[user.role]}: {ROLE_DESCRIPTIONS[user.role]}
        </p>
        <Link href={`/people/${user.id}`} className="btn btn-secondary">
          Edit my contact details
        </Link>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Your positions</h2>
        {positions.length === 0 ? (
          <p className="muted text-sm">You aren&apos;t on any teams yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {positions.map(({ position }) => (
              <li key={position.id} className="badge">
                {position.team.name} · {position.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Blackouts personId={user.id} timezone={org.timezone} canEdit />

      <ServingPreferences personId={user.id} maxPerMonth={preferences.maxPerMonth} weeks={preferences.preferredWeeks} canEdit />

      <details className="card group/edit">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <h2 className="font-semibold">Password</h2>
          <span className="btn btn-secondary group-open/edit:hidden">Change password</span>
          <span className="btn btn-secondary hidden group-open/edit:inline-flex">Close</span>
        </summary>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </details>

      <details className="card group/claude">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <h2 className="font-semibold">Claude connection</h2>
          <span className="muted text-sm group-open/claude:hidden">{connections.length > 0 ? `${connections.length} connected` : "Set up"}</span>
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <p className="muted text-sm">
            Lets Claude work in Simple Services for you: add songs and charts, build plans, schedule people. It acts as you, with your permissions, and
            asks before emailing anyone. Remove a connection here to cut it off.
          </p>
          {connections.length > 0 && (
            <ul className="divide-y divide-black/10 dark:divide-white/10">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{c.name}</span> <span className="muted">…{c.hint}</span>
                    <span className="muted block text-xs">
                      Made {c.createdAt.toLocaleDateString("en-US", { timeZone: org.timezone, month: "short", day: "numeric" })}
                      {c.lastUsedAt ? ` · last used ${c.lastUsedAt.toLocaleDateString("en-US", { timeZone: org.timezone, month: "short", day: "numeric" })}` : " · not used yet"}
                    </span>
                  </span>
                  <form action={revokeApiToken}>
                    <input type="hidden" name="tokenId" value={c.id} />
                    <SubmitButton className="btn btn-danger !min-h-8 !py-1 text-xs" confirm={`Remove the ${c.name} connection? Claude will no longer be able to use it.`}>
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl bg-black/[0.04] p-3 text-sm dark:bg-white/[0.06]">
            <p className="font-medium">On claude.ai or the Claude phone app</p>
            <p className="muted mt-1">
              In Claude, open Settings → Connectors → Add custom connector, and give it this address. Claude then sends you here to sign in and press Allow.
            </p>
            <code className="mt-2 block break-all rounded-lg bg-surface-raised px-2 py-1.5 text-xs">{appUrl}/api/mcp</code>
          </div>
          <p className="text-sm font-medium">For Claude Code</p>
          <NewConnectionForm appUrl={appUrl} />
        </div>
      </details>

      {user.role === "ADMIN" && (
        <section className="card">
          <h2 className="font-semibold">Getting started</h2>
          <p className="muted mb-3 mt-1 text-sm">The checklist for setting up this site, and bringing in Planning Center.</p>
          <Link href="/getting-started" className="btn btn-secondary w-fit">
            Open the checklist
          </Link>
        </section>
      )}

      {user.role === "ADMIN" && sample.people + sample.songs + sample.plans > 0 && (
        <section className="card">
          <h2 className="font-semibold">Sample data</h2>
          <p className="muted mb-3 mt-1 text-sm">
            {sample.people} {sample.people === 1 ? "person" : "people"}, {sample.songs} {sample.songs === 1 ? "song" : "songs"} and {sample.plans}{" "}
            {sample.plans === 1 ? "plan" : "plans"} are marked as test material from while the app was being built. Remove them all at once when you&apos;re ready
            for real use. Teams, service types and anyone with a login are kept.
          </p>
          <form action={removeSampleData}>
            <SubmitButton className="btn btn-danger" pendingLabel="Removing…" confirm="Remove all sample people, songs and plans? This can't be undone.">
              Remove all sample data
            </SubmitButton>
          </form>
        </section>
      )}

      <LogoutButton />
    </Page>
  );
}
