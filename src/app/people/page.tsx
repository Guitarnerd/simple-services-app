import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole, ROLE_LABELS, type Role } from "@/lib/roles";
import { Page } from "@/components/page";
import { Avatar, Icon } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { DraggablePerson } from "@/components/draggable-person";
import { RemovePerson } from "@/components/remove-person";

export const metadata: Metadata = { title: "People" };

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function PeoplePage({ searchParams }: PageProps<"/people">) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const q = first(params.q).trim();
  const teamId = first(params.team);
  const isPlanner = hasRole(user.role, "PLANNER");
  const showArchived = isPlanner && first(params.archived) === "1";

  const [found, teams] = await Promise.all([
    prisma.person.findMany({
      where: {
        organizationId: user.organizationId,
        archived: showArchived,
        ...(teamId ? { positions: { some: { position: { teamId } } } } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phones: { some: { number: { contains: q } } } },
              ],
            }
          : {}),
      },
      include: {
        phones: { orderBy: { isPrimary: "desc" } },
        positions: { include: { position: { include: { team: true } } } },
      },
    }),
    prisma.team.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  // Sorted here so capitals don't come before small letters.
  const people = found.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, undefined, { sensitivity: "base" }));

  return (
    <Page
      title="People"
      subtitle={`${people.length} ${showArchived ? "archived " : ""}${people.length === 1 ? "person" : "people"}`}
      actions={
        isPlanner && (
          <Link href="/people/new" className="btn btn-primary">
            Add person
          </Link>
        )
      }
    >
      <FilterBar className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input name="q" type="search" defaultValue={q} placeholder="Search name, email or phone" aria-label="Search people" className="input sm:flex-1" />
        <select name="team" defaultValue={teamId} aria-label="Filter by team" className="input sm:w-44">
          <option value="">All teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        {isPlanner && (
          <label className="flex items-center gap-2 px-1 text-sm">
            <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} aria-label="Show archived" />
            Archived
          </label>
        )}
      </FilterBar>

      {people.length === 0 ? (
        <p className="empty">No one matches that search.</p>
      ) : (
        <ul className="list">
          {people.map((person) => {
            const phone = person.phones[0];
            const teamNames = [...new Set(person.positions.map((p) => p.position.team.name))];
            const name = `${person.firstName} ${person.lastName}`;
            // Planners can remove anyone but themselves; only an admin can remove another admin.
            const canRemove = isPlanner && person.id !== user.id && (person.role !== "ADMIN" || user.role === "ADMIN");
            return (
              <DraggablePerson key={person.id} id={person.id} name={name} className="list-row">
                <Link href={`/people/${person.id}`} aria-label={name} className="flex min-w-0 flex-1 items-center gap-3.5">
                  <Avatar name={name} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      {/* What they can do in the app, kept apart from the teams they serve on. */}
                      {person.role !== "MEMBER" && <span className="badge shrink-0">{ROLE_LABELS[person.role as Role]}</span>}
                    </span>
                    <span className="muted block truncate text-xs">{teamNames.length > 0 ? teamNames.join(" · ") : "No team"}</span>
                  </span>
                </Link>
                {phone && (
                  <a href={`tel:${phone.number}`} aria-label={`Call ${name}`} title={phone.number} className="icon-btn sm:!w-auto sm:gap-1.5 sm:!px-2.5 sm:text-sm">
                    <Icon name="phone" className="h-4 w-4" />
                    <span className="hidden sm:inline">{phone.number}</span>
                  </a>
                )}
                {phone && (
                  <a href={`sms:${phone.number}`} aria-label={`Text ${name}`} title={`Text ${phone.number}`} className="icon-btn">
                    <Icon name="message" className="h-4 w-4" />
                  </a>
                )}
                {person.email && (
                  <a href={`mailto:${person.email}`} aria-label={`Email ${name}`} title={person.email} className="icon-btn">
                    <Icon name="mail" className="h-4 w-4" />
                  </a>
                )}
                {canRemove && <RemovePerson personId={person.id} name={name} archived={person.archived} />}
              </DraggablePerson>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
