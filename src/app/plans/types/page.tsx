import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { formatClock } from "@/lib/format";
import { Page } from "@/components/page";
import { Icon } from "@/components/ui";
import { ServiceTypeForm } from "@/components/plan-forms";

export const metadata: Metadata = { title: "Service types" };

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function ServiceTypesPage() {
  const user = await requireRole("PLANNER");
  const serviceTypes = await prisma.serviceType.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { sortOrder: "asc" },
    include: { templatePositions: { where: { optional: false }, select: { quantity: true } }, _count: { select: { templateItems: true } } },
  });

  return (
    <Page
      title="Service types"
      subtitle="The kinds of services you plan, such as Sunday Morning or Midweek. Each has a template that new plans start from."
      back={{ href: "/plans", label: "Plans" }}
    >
      {serviceTypes.length > 0 && (
        <ul className="list">
          {serviceTypes.map((type) => {
            const people = type.templatePositions.reduce((sum, need) => sum + need.quantity, 0);
            const template = [type._count.templateItems > 0 && count(type._count.templateItems, "template row"), people > 0 && `${people} ${people === 1 ? "person" : "people"} needed`].filter(
              Boolean
            );
            return (
              <li key={type.id}>
                <Link href={`/plans/types/${type.id}`} className="list-row">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{type.name}</div>
                    <div className="muted truncate text-sm">
                      {[type.defaultTime && formatClock(type.defaultTime), template.length > 0 ? template.join(" · ") : "No template yet"].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className="link hidden text-sm sm:inline">Edit template</span>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className="card flex flex-col gap-2">
        <ServiceTypeForm />
        <p className="muted text-xs">After adding it you&apos;ll go straight to its template: the service plan rows and team positions a new plan starts with.</p>
      </section>
    </Page>
  );
}
