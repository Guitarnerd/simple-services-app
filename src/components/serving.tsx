import { prisma } from "@/lib/prisma";
import { describeWeeks } from "@/lib/auto-schedule";
import { removeServingPartner } from "@/lib/actions/schedule";
import { ServingPartnerForm, ServingPreferencesForm } from "@/components/schedule-forms";
import { Icon } from "@/components/ui";

// How often and which weeks a person likes to serve. Auto-schedule keeps to these;
// someone scheduling by hand can still go outside them.
export function ServingPreferences({ personId, maxPerMonth, weeks, canEdit }: { personId: string; maxPerMonth: number | null; weeks: number[]; canEdit: boolean }) {
  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Serving preferences</h2>
        <p className="muted text-sm">How often to serve. Auto-schedule keeps to this.</p>
      </div>
      {canEdit ? (
        <ServingPreferencesForm personId={personId} maxPerMonth={maxPerMonth} weeks={weeks} />
      ) : (
        <p className="text-sm">
          {maxPerMonth ? `Up to ${maxPerMonth} ${maxPerMonth === 1 ? "time" : "times"} a month` : "No limit on how often"}
          {weeks.length > 0 ? `, the ${describeWeeks(weeks)} week of the month` : ", any week"}.
        </p>
      )}
    </section>
  );
}

// Who a person serves alongside. A pair is one row, so it shows on both people's pages.
export async function ServingPartners({ personId, organizationId, canEdit }: { personId: string; organizationId: string; canEdit: boolean }) {
  const name = { select: { id: true, firstName: true, lastName: true } };
  const [rows, people] = await Promise.all([
    prisma.servingPartner.findMany({
      where: { OR: [{ personAId: personId }, { personBId: personId }] },
      include: { personA: name, personB: name },
    }),
    canEdit
      ? prisma.person.findMany({
          where: { organizationId, archived: false, id: { not: personId } },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        })
      : [],
  ]);
  const partners = rows
    .map((row) => ({ ...(row.personAId === personId ? row.personB : row.personA), always: row.always }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const taken = new Set(partners.map((partner) => partner.id));

  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Serving partners</h2>
        <p className="muted text-sm">People auto-schedule puts on the same services. &ldquo;Always together&rdquo; is for family: neither is scheduled without the other. &ldquo;Prefer together&rdquo; is for people who work well together.</p>
      </div>

      {partners.length === 0 ? (
        <p className="muted text-sm">None yet.</p>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {partners.map((partner) => {
            const fullName = `${partner.firstName} ${partner.lastName}`;
            return (
              <li key={partner.id} className="flex items-center gap-2 py-1 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{fullName}</span>
                  <span className="muted"> · {partner.always ? "Always together" : "Prefer together"}</span>
                </span>
                {canEdit && (
                  <form action={removeServingPartner}>
                    <input type="hidden" name="personId" value={personId} />
                    <input type="hidden" name="partnerId" value={partner.id} />
                    <button type="submit" aria-label={`Remove ${fullName}`} title="Remove" className="icon-btn hover:!text-red-600">
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && <ServingPartnerForm personId={personId} people={people.filter((person) => !taken.has(person.id)).map((person) => ({ id: person.id, name: `${person.firstName} ${person.lastName}` }))} />}
    </section>
  );
}
