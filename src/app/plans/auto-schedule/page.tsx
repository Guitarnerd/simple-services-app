import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { hasRole } from "@/lib/roles";
import { autoScheduleProposal, planBackLink, undoableAutoRun } from "@/lib/schedule";
import { formatPlanDate, toDateInput, todayInZone } from "@/lib/format";
import { Page } from "@/components/page";
import { AutoScheduleForm } from "@/components/auto-schedule-form";
import { UndoAutoSchedule } from "@/components/auto-schedule";

export const metadata: Metadata = { title: "Auto-schedule" };

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function readDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The list behind Auto-schedule, reached from its confirmation: who it would put where
// and why any spot stays open, to tick through. Nobody is emailed until requests are sent.
export default async function AutoSchedulePage({ searchParams }: PageProps<"/plans/auto-schedule">) {
  const user = await requireRole("LEADER");
  const params = await searchParams;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { timezone: true } });
  const today = todayInZone(org.timezone);
  const serviceTypes = await prisma.serviceType.findMany({ where: { organizationId: user.organizationId }, orderBy: { sortOrder: "asc" } });

  // Today to the end of next month, unless asked otherwise. Past plans are left alone.
  const asked = readDate(first(params.from));
  const from = asked && asked > today ? asked : today;
  const to = readDate(first(params.to)) ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0));
  const typeId = first(params.type);
  const includeOptional = first(params.fill) === "all";

  const plans = await autoScheduleProposal(user, { from, to, serviceTypeId: typeId || undefined, includeOptional });
  const positionless = plans.filter((plan) => plan.usesNoPositions);
  const lastRun = await undoableAutoRun(user);
  const planId = first(params.plan);
  const back = (await planBackLink(user, planId)) ?? { href: "/plans/multi-view", label: "Multi View" };

  return (
    <Page
      title="Auto-schedule"
      subtitle="Suggests people for open spots, taking turns fairly. You choose what to keep."
      back={back}
    >
      {lastRun && <UndoAutoSchedule run={lastRun} />}

      {/* A plain form: it reloads the page with the choices in the address. */}
      <form action="/plans/auto-schedule" className="card grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        {planId && <input type="hidden" name="plan" value={planId} />}
        <div>
          <label className="label" htmlFor="auto-from">
            From
          </label>
          <input id="auto-from" name="from" type="date" defaultValue={toDateInput(from)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="auto-to">
            To
          </label>
          <input id="auto-to" name="to" type="date" defaultValue={toDateInput(to)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="auto-type">
            Service
          </label>
          <select id="auto-type" name="type" defaultValue={typeId} className="input">
            <option value="">All services</option>
            {serviceTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="sm:col-span-3">
          <legend className="label">Which positions should it fill?</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="fill" value="needed" defaultChecked={!includeOptional} className="h-4 w-4 accent-indigo-600" />
              Needed positions only
            </label>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="fill" value="all" defaultChecked={includeOptional} className="h-4 w-4 accent-indigo-600" />
              Needed and optional positions
            </label>
          </div>
        </fieldset>
        <button type="submit" className="btn btn-secondary">
          Show
        </button>
      </form>

      {plans.length === 0 ? (
        <p className="empty">
          No plans between {formatPlanDate(from, "short")} and {formatPlanDate(to, "short")}. Auto-schedule fills plans that already exist, so make them first.
        </p>
      ) : (
        <AutoScheduleForm plans={plans} />
      )}

      {positionless.length > 0 && (
        <p className="muted text-sm">
          {positionless.length === 1 ? "One plan's service doesn't" : `${positionless.length} plans' services don't`} say which positions they need, so there&apos;s nothing to fill.{" "}
          {hasRole(user.role, "PLANNER") && (
            <>
              Set them under{" "}
              <Link href="/plans/types" className="link">
                Service types
              </Link>
              .
            </>
          )}
        </p>
      )}
    </Page>
  );
}
