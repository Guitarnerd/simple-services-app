// Brings a church's Planning Center data into Simple Services: people, teams
// and positions, songs with their arrangements and typed chord charts, and
// plans with their order of service and who was scheduled.
//
//   npm run db:import-pco -- --dry-run      read Planning Center and report, change nothing
//   npm run db:import-pco -- --to local     import into the database on this computer
//   npm run db:import-pco -- --to web       import into the hosted database (WEB_DATABASE_URL)
//   add --clear-samples to remove everything marked as sample data first
//   add --ccli-only to do nothing but fill in songs' CCLI numbers
//   add --times-only to do nothing but add rehearsal and other times to plans already imported
//
// It needs a Planning Center "Personal Access Token" in .env:
//   PCO_APP_ID=...      PCO_SECRET=...
// (create one at https://api.planningcenteronline.com/oauth/applications)
//
// Safe to run again: everything it makes remembers its Planning Center id, so
// a second run updates rather than duplicates. It never sends email, and marks
// imported scheduling so the reminder job leaves it alone. Uploaded files
// (PDFs, MP3s) are not brought across; links are.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const TARGET = args.includes("--to") ? args[args.indexOf("--to") + 1] : null;
const CLEAR_SAMPLES = args.includes("--clear-samples");
// Only fill in songs' CCLI numbers, touching nothing else.
const CCLI_ONLY = args.includes("--ccli-only");
// Only add rehearsal and other times to plans already imported, touching nothing else.
const TIMES_ONLY = args.includes("--times-only");
// How far back to bring plans from. Everything upcoming always comes.
const MONTHS_BACK = Number(process.env.PCO_MONTHS_BACK ?? 12);

const API = "https://api.planningcenteronline.com";
const AUTH = "Basic " + Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString("base64");

type Resource = { id: string; type: string; attributes: Record<string, unknown>; relationships?: Record<string, { data: { id: string; type: string } | { id: string; type: string }[] | null }> };
type Page = { data: Resource[] | Resource; included?: Resource[]; links?: { next?: string }; meta?: { next?: { offset: number } } };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let requests = 0;

async function get(url: string): Promise<Page> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url.startsWith("http") ? url : API + url, { headers: { Authorization: AUTH } });
    requests++;
    // Planning Center allows about 100 requests every 20 seconds, and says how long to wait.
    if (response.status === 429 && attempt < 8) {
      await sleep((Number(response.headers.get("Retry-After")) || 5) * 1000 + 250);
      continue;
    }
    if (response.status === 401) throw new Error("Planning Center refused the token. Check PCO_APP_ID and PCO_SECRET in .env.");
    if (response.status === 403 || response.status === 404) return { data: [] };
    if (!response.ok) throw new Error(`Planning Center answered ${response.status} for ${url}`);
    return (await response.json()) as Page;
  }
}

// Every page of a list, with anything it was asked to include.
async function all(path: string): Promise<{ rows: Resource[]; included: Map<string, Resource> }> {
  const rows: Resource[] = [];
  const included = new Map<string, Resource>();
  let next: string | undefined = path + (path.includes("?") ? "&" : "?") + "per_page=100";
  while (next) {
    const page: Page = await get(next);
    rows.push(...(Array.isArray(page.data) ? page.data : [page.data]));
    for (const resource of page.included ?? []) included.set(`${resource.type}:${resource.id}`, resource);
    next = page.links?.next;
  }
  return { rows, included };
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const one = (resource: Resource, name: string) => {
  const data = resource.relationships?.[name]?.data;
  return data && !Array.isArray(data) ? data.id : null;
};
const many = (resource: Resource, name: string) => {
  const data = resource.relationships?.[name]?.data;
  return Array.isArray(data) ? data.map((d) => d.id) : [];
};

// Planning Center marks where a printed chart breaks; those lines mean nothing here.
function cleanChart(chart: unknown) {
  const value = text(chart);
  if (!value) return null;
  return value
    .split(/\r?\n/)
    .filter((line) => !/^\s*(COLUMN_BREAK|PAGE_BREAK)\s*$/i.test(line))
    .join("\n")
    .trim();
}

const OWN_HOSTS = /planningcenteronline\.com|planningcenterusercontent|pcocdn|amazonaws/;

// A link someone attached to a song. Planning Center hides a YouTube link's real
// address behind its own page; asking it to "open" the attachment gives it up.
async function linkOf(attachment: Resource) {
  const a = attachment.attributes;
  const name = (text(a.display_name) ?? text(a.filename) ?? "Link").replace(/^YouTube:\s*/i, "").slice(0, 200);
  const direct = [a.remote_link, a.linked_url].map(text).find((u) => u && /^https?:\/\//.test(u) && !OWN_HOSTS.test(u));
  if (direct) return { name, url: direct };
  if (text(a.pco_type) !== "AttachmentYoutube") return null;

  const response = await fetch(`${API}/services/v2/attachments/${attachment.id}/open`, { method: "POST", headers: { Authorization: AUTH } });
  requests++;
  if (response.status === 429) {
    await sleep((Number(response.headers.get("Retry-After")) || 5) * 1000 + 250);
    return linkOf(attachment);
  }
  if (!response.ok) return null;
  const opened = (await response.json()) as { data?: Resource };
  const url = text(opened.data?.attributes.attachment_url);
  return url && /^https?:\/\//.test(url) && !OWN_HOSTS.test(url) ? { name, url } : null;
}

// A plan's times: when the service itself starts (the earliest "service" time; the plan's
// own sort date isn't it), and everything else, such as rehearsals.
async function planTimes(serviceTypeId: string, planId: string) {
  const rows = (await all(`/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_times`)).rows.filter((time) => text(time.attributes.starts_at));
  const services = rows.filter((time) => text(time.attributes.time_type) === "service").sort((a, b) => String(a.attributes.starts_at).localeCompare(String(b.attributes.starts_at)));
  const names = { rehearsal: "Rehearsal", service: "Service", other: "Other" } as Record<string, string>;
  return {
    startsAt: text(services[0]?.attributes.starts_at),
    otherTimes: rows
      .filter((time) => time !== services[0])
      .map((time) => ({ label: (text(time.attributes.name) ?? names[text(time.attributes.time_type) ?? ""] ?? "Other time").slice(0, 60), startsAt: text(time.attributes.starts_at) as string })),
  };
}

async function main() {
  if (!process.env.PCO_APP_ID || !process.env.PCO_SECRET) throw new Error("Add PCO_APP_ID and PCO_SECRET (a Planning Center Personal Access Token) to .env first.");
  if (!DRY && TARGET !== "local" && TARGET !== "web") throw new Error("Say where to import: --to local, --to web, or --dry-run to only look.");
  const address = TARGET === "web" ? process.env.WEB_DATABASE_URL : process.env.DATABASE_URL;
  if (!DRY && !address) throw new Error(TARGET === "web" ? "Add WEB_DATABASE_URL (the hosted database's address) to .env first." : "DATABASE_URL is missing from .env.");

  if (CCLI_ONLY) {
    const numbers = (await all("/services/v2/songs")).rows.map((song) => ({ pcoId: song.id, ccliNumber: String(song.attributes.ccli_number ?? "").replace(/\D/g, "") || null }));
    console.log(`Planning Center has ${numbers.length} songs, ${numbers.filter((n) => n.ccliNumber).length} with a CCLI number.`);
    if (DRY) return;
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: address, max: 1 }) });
    try {
      let filled = 0;
      for (const { pcoId, ccliNumber } of numbers) {
        // A number already set here (perhaps corrected by hand) is left alone.
        if (ccliNumber) filled += (await prisma.song.updateMany({ where: { pcoId, ccliNumber: null }, data: { ccliNumber } })).count;
      }
      console.log(`Filled in ${filled} CCLI numbers (${TARGET}).`);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  if (TIMES_ONLY) {
    const prisma = DRY ? null : new PrismaClient({ adapter: new PrismaPg({ connectionString: address, max: 1 }) });
    try {
      const org = await prisma?.organization.findFirstOrThrow();
      const local = new Intl.DateTimeFormat("en-CA", { timeZone: org?.timezone ?? "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      let found = 0;
      let added = 0;
      for (const type of (await all("/services/v2/service_types")).rows) {
        const rows = [...(await all(`/services/v2/service_types/${type.id}/plans?filter=future&order=sort_date`)).rows, ...(await all(`/services/v2/service_types/${type.id}/plans?filter=past&order=-sort_date`)).rows];
        for (const plan of rows) {
          const mine = await prisma?.plan.findFirst({ where: { pcoId: plan.id }, include: { _count: { select: { times: true } } } });
          if (prisma && !mine) continue;
          const { otherTimes } = await planTimes(type.id, plan.id);
          found += otherTimes.length;
          // A plan that already has times here is left alone.
          if (!prisma || !mine || mine._count.times > 0 || otherTimes.length === 0) continue;
          await prisma.planTime.createMany({
            data: otherTimes.map((time) => {
              const parts = Object.fromEntries(local.formatToParts(new Date(time.startsAt)).map((part) => [part.type, part.value]));
              return { planId: mine.id, label: time.label, date: new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`), time: `${parts.hour}:${parts.minute}` };
            }),
          });
          added += otherTimes.length;
        }
      }
      console.log(`Planning Center has ${found} rehearsal and other times on ${prisma ? "the imported plans" : "its plans"}.${prisma ? ` Added ${added} (${TARGET}).` : ""}`);
    } finally {
      await prisma?.$disconnect();
    }
    return;
  }

  // ---------- read Planning Center ----------
  console.log("Reading Planning Center…");
  const since = new Date();
  since.setMonth(since.getMonth() - MONTHS_BACK);

  const servicePeople = (await all("/services/v2/people")).rows;
  // Contact details live in the People product, under the same ids.
  const contacts = await all("/people/v2/people?include=emails,phone_numbers");
  const contactOf = new Map(contacts.rows.map((person) => [person.id, person]));

  const serviceTypes = (await all("/services/v2/service_types")).rows.filter((type) => !type.attributes.archived_at && !type.attributes.deleted_at);
  const teams = await all("/services/v2/teams?include=team_positions");
  const liveTeams = teams.rows.filter((team) => !team.attributes.archived_at && !team.attributes.deleted_at);
  const positionsOf = new Map<string, Resource[]>();
  for (const resource of teams.included.values()) {
    if (resource.type !== "TeamPosition") continue;
    const teamId = one(resource, "team");
    if (teamId) positionsOf.set(teamId, [...(positionsOf.get(teamId) ?? []), resource]);
  }
  // Who can fill each position.
  const holders: { positionId: string; personId: string }[] = [];
  for (const team of liveTeams) {
    const assigned = (await all(`/services/v2/teams/${team.id}/person_team_position_assignments`)).rows;
    for (const row of assigned) {
      const positionId = one(row, "team_position");
      const personId = one(row, "person");
      if (positionId && personId) holders.push({ positionId, personId });
    }
  }

  const songs = (await all("/services/v2/songs")).rows;
  const arrangementsOf = new Map<string, Resource[]>();
  const keysOf = new Map<string, Resource[]>();
  const linksOf = new Map<string, { name: string; url: string; arrangementId: string | null }[]>();
  for (const [n, song] of songs.entries()) {
    if (n % 25 === 0 && n > 0) console.log(`  …${n} of ${songs.length} songs`);
    const arrangements = (await all(`/services/v2/songs/${song.id}/arrangements`)).rows;
    arrangementsOf.set(song.id, arrangements);
    const links = [];
    for (const attachment of (await all(`/services/v2/songs/${song.id}/attachments`)).rows) {
      const link = await linkOf(attachment);
      if (link) links.push({ ...link, arrangementId: null });
    }
    for (const arrangement of arrangements) {
      keysOf.set(arrangement.id, (await all(`/services/v2/songs/${song.id}/arrangements/${arrangement.id}/keys`)).rows);
      for (const attachment of (await all(`/services/v2/songs/${song.id}/arrangements/${arrangement.id}/attachments`)).rows) {
        const link = await linkOf(attachment);
        if (link) links.push({ ...link, arrangementId: arrangement.id });
      }
    }
    linksOf.set(song.id, links);
  }

  type PlanRead = { plan: Resource; serviceTypeId: string; items: Resource[]; members: Resource[]; startsAt: string | null; otherTimes: { label: string; startsAt: string }[] };
  const plans: PlanRead[] = [];
  for (const type of serviceTypes) {
    const rows = [...(await all(`/services/v2/service_types/${type.id}/plans?filter=future&order=sort_date`)).rows, ...(await all(`/services/v2/service_types/${type.id}/plans?filter=past&order=-sort_date`)).rows];
    for (const plan of rows) {
      const when = text(plan.attributes.sort_date);
      if (!when || new Date(when) < since) continue;
      plans.push({
        plan,
        serviceTypeId: type.id,
        items: (await all(`/services/v2/service_types/${type.id}/plans/${plan.id}/items`)).rows,
        members: (await all(`/services/v2/service_types/${type.id}/plans/${plan.id}/team_members`)).rows,
        ...(await planTimes(type.id, plan.id)),
      });
      if (plans.length % 20 === 0) console.log(`  …${plans.length} plans`);
    }
  }

  const otherTimeCount = plans.reduce((sum, p) => sum + p.otherTimes.length, 0);
  const arrangementCount = [...arrangementsOf.values()].reduce((sum, list) => sum + list.length, 0);
  const charts = [...arrangementsOf.values()].flat().filter((a) => cleanChart(a.attributes.chord_chart)).length;
  console.log(`\nPlanning Center has (${requests} requests):`);
  console.log(`  ${servicePeople.length} people in Services (${servicePeople.filter((p) => text(p.attributes.status) === "inactive" || p.attributes.archived_at).length} inactive or archived)`);
  console.log(`  ${liveTeams.length} teams, ${[...positionsOf.entries()].filter(([id]) => liveTeams.some((t) => t.id === id)).reduce((sum, [, list]) => sum + list.length, 0)} positions, ${holders.length} position memberships`);
  console.log(`  ${songs.length} songs, ${arrangementCount} arrangements, ${charts} typed chord charts, ${[...linksOf.values()].reduce((sum, list) => sum + list.length, 0)} links`);
  console.log(`  ${serviceTypes.length} service types: ${serviceTypes.map((t) => t.attributes.name).join(", ")}`);
  console.log(`  ${otherTimeCount} other times on plans (rehearsals and the like)`);
  console.log(`  plans without a service time: ${plans.filter((p) => !p.startsAt).length}`);
  console.log(`  ${plans.length} plans since ${since.toISOString().slice(0, 10)} (${plans.reduce((sum, p) => sum + p.items.length, 0)} rows, ${plans.reduce((sum, p) => sum + p.members.length, 0)} scheduled spots)`);
  if (DRY) {
    console.log("\nDry run: nothing was changed.");
    return;
  }

  // ---------- write ----------
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: address, max: 1 }) });
  try {
    const org = await prisma.organization.findFirstOrThrow();
    console.log(`\nImporting into ${org.name} (${TARGET})…`);

    if (CLEAR_SAMPLES) {
      const where = { organizationId: org.id, sample: true };
      const gone = [await prisma.plan.deleteMany({ where }), await prisma.song.deleteMany({ where }), await prisma.person.deleteMany({ where: { ...where, passwordHash: null } })];
      console.log(`Cleared sample data: ${gone[0].count} plans, ${gone[1].count} songs, ${gone[2].count} people`);
    }

    // The date and clock time of an instant, as the church's wall clock saw it.
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const wallClock = (iso: string) => {
      const parts = Object.fromEntries(local.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
      return { date: new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`), time: `${parts.hour}:${parts.minute}` };
    };

    // --- people ---
    const personId = new Map<string, string>();
    const usedEmails = new Set((await prisma.person.findMany({ where: { email: { not: null } }, select: { email: true } })).map((p) => p.email as string));
    let peopleMade = 0;
    for (const person of servicePeople) {
      const contact = contactOf.get(person.id);
      const emails = contact ? many(contact, "emails").map((id) => contacts.included.get(`Email:${id}`)).filter((e): e is Resource => Boolean(e)) : [];
      const phones = contact ? many(contact, "phone_numbers").map((id) => contacts.included.get(`PhoneNumber:${id}`)).filter((p): p is Resource => Boolean(p)) : [];
      const email = text((emails.find((e) => e.attributes.primary) ?? emails[0])?.attributes.address)?.toLowerCase() ?? null;
      const data = {
        firstName: text(person.attributes.first_name) ?? "?",
        lastName: text(person.attributes.last_name) ?? "",
        archived: Boolean(person.attributes.archived_at) || text(person.attributes.status) === "inactive",
      };

      // Someone already here (matched by Planning Center id, then by email) is kept, not doubled.
      const existing = (await prisma.person.findFirst({ where: { organizationId: org.id, pcoId: person.id } })) ?? (email ? await prisma.person.findFirst({ where: { organizationId: org.id, email } }) : null);
      if (existing) {
        await prisma.person.update({ where: { id: existing.id }, data: { pcoId: person.id, ...(existing.passwordHash ? {} : data) } });
        personId.set(person.id, existing.id);
        continue;
      }
      // An email can belong to one person only; a second family member sharing it goes without.
      const ownEmail = email && !usedEmails.has(email) ? email : null;
      if (ownEmail) usedEmails.add(ownEmail);
      const created = await prisma.person.create({
        data: {
          ...data,
          organizationId: org.id,
          pcoId: person.id,
          email: ownEmail,
          phones: {
            create: phones
              .filter((phone) => text(phone.attributes.number))
              .map((phone, n) => ({ number: text(phone.attributes.number) as string, label: text(phone.attributes.location) ?? "Mobile", isPrimary: phones.some((p) => p.attributes.primary) ? Boolean(phone.attributes.primary) : n === 0 })),
          },
        },
      });
      personId.set(person.id, created.id);
      peopleMade++;
    }
    console.log(`People: ${peopleMade} added, ${servicePeople.length - peopleMade} already here`);

    // --- service types ---
    const serviceTypeId = new Map<string, string>();
    for (const [n, type] of serviceTypes.entries()) {
      const name = text(type.attributes.name) ?? "Service";
      const existing = (await prisma.serviceType.findFirst({ where: { organizationId: org.id, pcoId: type.id } })) ?? (await prisma.serviceType.findFirst({ where: { organizationId: org.id, name } }));
      const saved = existing ? await prisma.serviceType.update({ where: { id: existing.id }, data: { pcoId: type.id } }) : await prisma.serviceType.create({ data: { organizationId: org.id, name, pcoId: type.id, sortOrder: 100 + n } });
      serviceTypeId.set(type.id, saved.id);
    }

    // --- teams and positions. Planning Center keeps teams per service type; here a team of the same name is one team. ---
    const positionId = new Map<string, string>();
    const positionByName = new Map<string, string>();
    const teamName = new Map<string, string>();
    for (const [n, team] of liveTeams.entries()) {
      const name = text(team.attributes.name) ?? "Team";
      teamName.set(team.id, name);
      const saved = (await prisma.team.findFirst({ where: { organizationId: org.id, name } })) ?? (await prisma.team.create({ data: { organizationId: org.id, name, pcoId: team.id, sortOrder: 100 + n } }));
      for (const [m, position] of (positionsOf.get(team.id) ?? []).entries()) {
        const positionName = text(position.attributes.name) ?? "Position";
        const row = (await prisma.position.findFirst({ where: { teamId: saved.id, name: positionName } })) ?? (await prisma.position.create({ data: { teamId: saved.id, name: positionName, pcoId: position.id, sortOrder: 100 + m } }));
        positionId.set(position.id, row.id);
        positionByName.set(`${name}\n${positionName}`.toLowerCase(), row.id);
      }
    }
    const memberships = new Map<string, { personId: string; positionId: string }>();
    for (const holder of holders) {
      const person = personId.get(holder.personId);
      const position = positionId.get(holder.positionId);
      if (person && position) memberships.set(`${person}:${position}`, { personId: person, positionId: position });
    }
    await prisma.personPosition.createMany({ data: [...memberships.values()], skipDuplicates: true });
    console.log(`Teams: ${liveTeams.length} teams, ${positionId.size} positions, ${memberships.size} position memberships`);

    // --- songs ---
    const songId = new Map<string, string>();
    const arrangementId = new Map<string, string>();
    const arrangementKey = new Map<string, string | null>();
    let songsMade = 0;
    for (const song of songs) {
      const data = {
        title: text(song.attributes.title) ?? "Untitled",
        author: text(song.attributes.author),
        ccliNumber: String(song.attributes.ccli_number ?? "").replace(/\D/g, "") || null,
        notes: text(song.attributes.notes),
        archived: Boolean(song.attributes.hidden),
      };
      const existing = await prisma.song.findFirst({ where: { organizationId: org.id, pcoId: song.id } });
      const saved = existing ? await prisma.song.update({ where: { id: existing.id }, data }) : await prisma.song.create({ data: { ...data, organizationId: org.id, pcoId: song.id } });
      if (!existing) songsMade++;
      songId.set(song.id, saved.id);

      for (const [n, arrangement] of (arrangementsOf.get(song.id) ?? []).entries()) {
        const a = arrangement.attributes;
        const keys = keysOf.get(arrangement.id) ?? [];
        const key = text(a.chord_chart_key) ?? text(keys[0]?.attributes.starting_key);
        const sequence = Array.isArray(a.sequence) ? a.sequence.map(text).filter(Boolean).join(", ") : text(a.sequence);
        const fields = {
          name: text(a.name) ?? "Default",
          key,
          bpm: typeof a.bpm === "number" && a.bpm > 0 ? Math.round(a.bpm) : null,
          meter: text(a.meter),
          lengthSeconds: typeof a.length === "number" && a.length > 0 ? Math.round(a.length) : null,
          sequence: sequence || null,
          notes: text(a.notes),
          chart: cleanChart(a.chord_chart),
          chartKey: text(a.chord_chart_key) ?? key,
          sortOrder: n,
        };
        const was = await prisma.arrangement.findFirst({ where: { songId: saved.id, pcoId: arrangement.id } });
        // A chart already edited here is not overwritten by a later run.
        const row = was ? await prisma.arrangement.update({ where: { id: was.id }, data: { ...fields, chart: was.chart ?? fields.chart } }) : await prisma.arrangement.create({ data: { ...fields, songId: saved.id, pcoId: arrangement.id } });
        arrangementId.set(arrangement.id, row.id);
        arrangementKey.set(arrangement.id, key);
      }
      // A song must have an arrangement to be planned with.
      if ((arrangementsOf.get(song.id) ?? []).length === 0 && !existing) await prisma.arrangement.create({ data: { songId: saved.id, name: "Default" } });

      for (const link of linksOf.get(song.id) ?? []) {
        const already = await prisma.attachment.findFirst({ where: { songId: saved.id, url: link.url } });
        if (!already) await prisma.attachment.create({ data: { organizationId: org.id, songId: saved.id, arrangementId: link.arrangementId ? (arrangementId.get(link.arrangementId) ?? null) : null, kind: "LINK", name: link.name, url: link.url } });
      }
    }
    console.log(`Songs: ${songsMade} added, ${songs.length - songsMade} updated, ${arrangementId.size} arrangements`);

    // --- plans ---
    const STATUS = { C: "CONFIRMED", U: "PENDING", D: "DECLINED" } as const;
    const ITEM = { song: "SONG", header: "HEADER", item: "ITEM", media: "ITEM" } as const;
    let plansMade = 0;
    let scheduled = 0;
    for (const { plan, serviceTypeId: type, items, members, startsAt, otherTimes } of plans) {
      const when = wallClock(startsAt ?? (text(plan.attributes.sort_date) as string));
      const data = { date: when.date, startTime: startsAt ? when.time : null, title: text(plan.attributes.title) };
      const existing = await prisma.plan.findFirst({ where: { organizationId: org.id, pcoId: plan.id } });
      const saved = existing
        ? await prisma.plan.update({ where: { id: existing.id }, data })
        : await prisma.plan.create({ data: { ...data, organizationId: org.id, serviceTypeId: serviceTypeId.get(type) as string, pcoId: plan.id } });
      if (!existing) plansMade++;

      // The order of service is taken as Planning Center has it.
      const rows = [...items]
        .sort((a, b) => Number(a.attributes.sequence ?? 0) - Number(b.attributes.sequence ?? 0))
        .map((item, position) => {
          const a = item.attributes;
          const kind = ITEM[text(a.item_type) as keyof typeof ITEM] ?? "ITEM";
          const song = one(item, "song");
          const arrangement = one(item, "arrangement");
          return {
            planId: saved.id,
            position,
            type: kind,
            title: (text(a.title) ?? (kind === "SONG" ? "Song" : "Item")).slice(0, 200),
            lengthSeconds: kind !== "HEADER" && typeof a.length === "number" && a.length > 0 ? Math.round(a.length) : null,
            notes: text(a.description),
            songId: kind === "SONG" && song ? (songId.get(song) ?? null) : null,
            arrangementId: kind === "SONG" && arrangement ? (arrangementId.get(arrangement) ?? null) : null,
            key: kind === "SONG" ? (text(a.key_name) ?? (arrangement ? (arrangementKey.get(arrangement) ?? null) : null)) : null,
          };
        });
      await prisma.$transaction([prisma.planItem.deleteMany({ where: { planId: saved.id } }), prisma.planItem.createMany({ data: rows })]);

      // Rehearsal and other times, unless some have been set here already.
      if (otherTimes.length > 0 && (await prisma.planTime.count({ where: { planId: saved.id } })) === 0) {
        await prisma.planTime.createMany({ data: otherTimes.map((time) => ({ planId: saved.id, label: time.label, ...(({ date, time: clock }) => ({ date, time: clock }))(wallClock(time.startsAt)) })) });
      }

      const now = new Date();
      const spots = new Map<string, { planId: string; personId: string; positionId: string; status: (typeof STATUS)[keyof typeof STATUS]; declineReason: string | null; notifiedAt: Date; respondedAt: Date | null; reminderSentAt: Date; serviceReminderSentAt: Date }>();
      for (const member of members) {
        const person = personId.get(one(member, "person") ?? "");
        const team = teamName.get(one(member, "team") ?? "");
        const position = positionByName.get(`${team}\n${text(member.attributes.team_position_name)}`.toLowerCase());
        if (!person || !position) continue;
        const status = STATUS[text(member.attributes.status) as keyof typeof STATUS] ?? "PENDING";
        // Marked as already asked and already reminded, so importing never causes an email.
        spots.set(`${person}:${position}`, { planId: saved.id, personId: person, positionId: position, status, declineReason: text(member.attributes.decline_reason), notifiedAt: now, respondedAt: status === "PENDING" ? null : now, reminderSentAt: now, serviceReminderSentAt: now });
      }
      await prisma.assignment.createMany({ data: [...spots.values()], skipDuplicates: true });
      scheduled += spots.size;
    }
    console.log(`Plans: ${plansMade} added, ${plans.length - plansMade} updated, ${scheduled} scheduled spots`);
    console.log("\nDone. No emails were sent.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
