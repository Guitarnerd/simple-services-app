import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canEditPerson, canManageTeam, getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole, ROLE_LABELS, type Role } from "@/lib/roles";
import { setArchived } from "@/lib/actions/people";
import { Page } from "@/components/page";
import { SubmitButton } from "@/components/form";
import { PersonForm } from "@/components/person-form";
import { Blackouts } from "@/components/blackouts";
import { ServingPartners, ServingPreferences } from "@/components/serving";
import { PersonCalendar } from "@/components/person-calendar";
import { todayInZone } from "@/lib/format";
import { InviteForm, PositionsForm, RoleForm } from "@/components/person-access";

export const metadata: Metadata = { title: "Person" };

function loginStatus(person: { passwordHash: string | null; invitedAt: Date | null; lastLoginAt: Date | null }) {
  if (person.passwordHash) {
    return person.lastLoginAt
      ? `Has a login. Last signed in ${person.lastLoginAt.toLocaleDateString("en-US", { dateStyle: "medium" })}.`
      : "Has a login.";
  }
  if (person.invitedAt) {
    return `Invited ${person.invitedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}, hasn't set a password yet.`;
  }
  return "No login yet.";
}

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();

  const [person, teams] = await Promise.all([
    prisma.person.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        phones: { orderBy: { isPrimary: "desc" } },
        positions: { include: { position: { include: { team: true } } } },
      },
    }),
    prisma.team.findMany({
      where: { organizationId: user.organizationId },
      include: { positions: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  if (!person) notFound();

  const isPlanner = hasRole(user.role, "PLANNER");
  const isAdmin = user.role === "ADMIN";
  const canEdit = canEditPerson(user, person.id);
  const held = new Set(person.positions.map((p) => p.positionId));
  const manageableTeams = teams.filter((team) => canManageTeam(user, team.id));
  const fullName = `${person.firstName} ${person.lastName}`;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });

  return (
    <Page
      title={fullName}
      subtitle={
        <>
          {ROLE_LABELS[person.role as Role]}
          {person.archived && " · Archived"}
        </>
      }
      back={{ href: "/people", label: "People" }}
    >
      {canEdit ? (
        <PersonForm
          showNotes={isPlanner}
          person={{
            id: person.id,
            firstName: person.firstName,
            lastName: person.lastName,
            email: person.email ?? "",
            birthday: person.birthday?.toISOString().slice(0, 10) ?? "",
            street: person.street ?? "",
            city: person.city ?? "",
            state: person.state ?? "",
            postalCode: person.postalCode ?? "",
            notes: person.notes ?? "",
            phones: person.phones.map(({ label, number, isPrimary }) => ({ label, number, isPrimary })),
          }}
        />
      ) : (
        <section className="card">
          <h2 className="mb-3 font-semibold">Contact</h2>
          <dl className="flex flex-col gap-2 text-sm">
            {person.email && (
              <div className="flex gap-3">
                <dt className="muted w-16 shrink-0">Email</dt>
                <dd className="min-w-0 truncate">
                  <a href={`mailto:${person.email}`} className="link">
                    {person.email}
                  </a>
                </dd>
              </div>
            )}
            {person.phones.map((phone) => (
              <div key={phone.id} className="flex gap-3">
                <dt className="muted w-16 shrink-0">{phone.label}</dt>
                <dd>
                  <a href={`tel:${phone.number}`} className="link">
                    {phone.number}
                  </a>
                </dd>
              </div>
            ))}
            {!person.email && person.phones.length === 0 && <p className="muted">No contact details yet.</p>}
          </dl>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 font-semibold">Teams and positions</h2>
        {manageableTeams.length > 0 ? (
          <PositionsForm
            personId={person.id}
            teams={manageableTeams.map((team) => ({
              id: team.id,
              name: team.name,
              positions: team.positions.map((p) => ({ id: p.id, name: p.name, checked: held.has(p.id) })),
            }))}
          />
        ) : person.positions.length === 0 ? (
          <p className="muted text-sm">Not on any teams yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {person.positions.map(({ position }) => (
              <li key={position.id}>
                <Link href={`/teams/${position.teamId}`} className="badge hover:underline">
                  {position.team.name} · {position.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="card flex flex-col gap-5">
          <div>
            <h2 className="font-semibold">Login</h2>
            <p className="muted mb-3 text-sm">{loginStatus(person)}</p>
            {person.archived ? (
              <p className="muted text-sm">Archived people can&apos;t sign in.</p>
            ) : person.email ? (
              <InviteForm
                personId={person.id}
                label={person.passwordHash ? "Email a new sign-in link" : person.invitedAt ? "Resend invitation" : "Send invitation"}
              />
            ) : (
              <p className="muted text-sm">Add an email address above to invite {person.firstName}.</p>
            )}
          </div>
          <div className="border-t border-black/10 pt-5 dark:border-white/10">
            <h2 className="mb-3 font-semibold">Permission level</h2>
            <RoleForm personId={person.id} role={person.role as Role} />
          </div>
        </section>
      )}

      {/* When they're serving, for the people who schedule (and for themselves). */}
      {(person.id === user.id || hasRole(user.role, "LEADER")) && (
        <div className="max-w-sm">
          <PersonCalendar personId={person.id} today={todayInZone(org.timezone)} title={person.id === user.id ? "Your calendar" : `When ${person.firstName} is scheduled`} />
        </div>
      )}

      {(canEdit || hasRole(user.role, "LEADER")) && (
        <>
          <Blackouts personId={person.id} timezone={org.timezone} canEdit={canEdit} />
          <ServingPreferences personId={person.id} maxPerMonth={person.maxPerMonth} weeks={person.preferredWeeks} canEdit={canEdit} />
          <ServingPartners personId={person.id} organizationId={user.organizationId} canEdit={isPlanner} />
        </>
      )}

      {isPlanner && person.id !== user.id && (person.role !== "ADMIN" || isAdmin) && (
        <form action={setArchived} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="personId" value={person.id} />
          <input type="hidden" name="archived" value={person.archived ? "false" : "true"} />
          {person.archived ? (
            <SubmitButton className="btn btn-secondary">Restore {person.firstName}</SubmitButton>
          ) : (
            <SubmitButton
              className="btn btn-danger"
              confirm={`Archive ${fullName}? They'll be hidden from the directory and unable to sign in. You can restore them later.`}
            >
              Archive {person.firstName}
            </SubmitButton>
          )}
        </form>
      )}
    </Page>
  );
}
