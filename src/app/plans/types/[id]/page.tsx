import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { formatLength } from "@/lib/format";
import { Page } from "@/components/page";
import { ServiceTypeForm } from "@/components/plan-forms";
import { NeededPositionsForm, TemplateItemsEditor } from "@/components/service-template";
import { PlanSections } from "@/components/plan-sections";
import { TemplateTimesEditor } from "@/components/plan-times";
import { formatClock } from "@/lib/format";

export const metadata: Metadata = { title: "Service type" };

export default async function ServiceTypePage({ params }: PageProps<"/plans/types/[id]">) {
  const { id } = await params;
  const user = await requireRole("PLANNER");

  const [type, teams] = await Promise.all([
    prisma.serviceType.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { templateItems: { orderBy: { position: "asc" } }, templatePositions: true, templateTimes: { orderBy: [{ daysBefore: "desc" }, { time: "asc" }] } },
    }),
    prisma.team.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { sortOrder: "asc" },
      include: { positions: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);
  if (!type) notFound();

  const needs = new Map(type.templatePositions.map((need) => [need.positionId, need]));

  return (
    <Page title={type.name} subtitle="What a new plan of this type starts with." back={{ href: "/plans/types", label: "Service types" }} wide>
      {/* Laid out like the plan page, so a template reads like the plans it makes. */}
      <PlanSections
        order={
          <section className="panel">
            <h2 className="panel-head">Service plan template</h2>
            <div className="px-2 py-3 sm:px-3 sm:py-4">
              <TemplateItemsEditor
                serviceTypeId={type.id}
                startTime={type.defaultTime}
                items={type.templateItems.map((item) => ({ id: item.id, type: item.type, title: item.title, length: formatLength(item.lengthSeconds), preService: item.preService, notes: item.notes ?? "" }))}
              />
            </div>
          </section>
        }
        team={
          <section className="panel">
            <h2 className="panel-head">Positions</h2>
            <div className="panel-body flex flex-col gap-4">
              <p className="muted text-sm">
                How many people a {type.name} service uses in each position. Tick Optional for one that&apos;s nice to have but can go unfilled. Leave a position blank if this service doesn&apos;t use it; a team with none
                is hidden on its plans.
              </p>
              {teams.some((team) => team.positions.length > 0) ? (
                <NeededPositionsForm
                  serviceTypeId={type.id}
                  teams={teams
                    .filter((team) => team.positions.length > 0)
                    .map((team) => ({
                      id: team.id,
                      name: team.name,
                      positions: team.positions.map((position) => ({ id: position.id, name: position.name, quantity: needs.get(position.id)?.quantity ?? 0, optional: needs.get(position.id)?.optional ?? false })),
                    }))}
                />
              ) : (
                <p className="empty">
                  No positions yet.{" "}
                  <Link href="/teams" className="link">
                    Add teams and positions
                  </Link>{" "}
                  first.
                </p>
              )}
            </div>
          </section>
        }
        details={
          <section className="panel">
            <h2 className="panel-head">Details</h2>
            <div className="panel-body flex flex-col gap-4">
              <ServiceTypeForm serviceType={{ id: type.id, name: type.name, defaultTime: type.defaultTime ?? "" }} />
              <div className="flex flex-col gap-4 border-t border-black/10 pt-4 dark:border-white/10">
                <p className="muted text-sm">Rehearsal, arrival, setup and the like. Every new {type.name} plan starts with these; they can be changed on each plan.</p>
                <TemplateTimesEditor
                  serviceTypeId={type.id}
                  times={type.templateTimes.map((time) => ({
                    id: time.id,
                    text: time.time ? `${time.label} at ${formatClock(time.time)}${time.daysBefore === 0 ? "" : `, ${time.daysBefore} ${time.daysBefore === 1 ? "day" : "days"} before`}` : `${time.label}: TBD`,
                  }))}
                />
              </div>
            </div>
          </section>
        }
      />
    </Page>
  );
}
