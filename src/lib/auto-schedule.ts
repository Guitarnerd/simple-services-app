// Works out who to put on which plan. Pure, so it can be tested without a database:
// dates are "YYYY-MM-DD" strings and nothing here writes anything. `autoScheduleProposal`
// in schedule.ts gathers the facts and the auto-schedule page shows the result to approve.
//
// Plans are filled earliest first. Limits a person has set are never broken: blackouts,
// how often they serve, which weeks of the month, and "always together". A spot nobody
// can take stays open, with the reasons, for a person to settle by hand.

export type AutoPerson = {
  id: string;
  name: string;
  positionIds: string[];
  // Most days a month, or null for no limit.
  maxPerMonth: number | null;
  // Weeks of the month, 1 to 5. Empty means any.
  weeks: number[];
  blackouts: { start: string; end: string }[];
};

export type AutoPlan = {
  id: string;
  date: string;
  // How many more each position wants. Only positions the scheduler may fill.
  // Optional ones are filled after every needed one has had its turn.
  open: { positionId: string; count: number; optional?: boolean }[];
  // Every position in this run, whether it's full or someone else fills it.
  used: string[];
  // People on the plan and not declined, and people who said no to it.
  on: string[];
  declined: string[];
};

export type AutoPartner = { a: string; b: string; always: boolean };

export type AutoPlacement = { personId: string; positionId: string; with: string[] };
export type AutoOpenSpot = { positionId: string; count: number; optional: boolean; why: string[] };
export type AutoPlanResult = { planId: string; placed: AutoPlacement[]; open: AutoOpenSpot[] };

type Need = { positionId: string; quantity: number; optional: boolean };

// What a plan needs: its service type's positions, with the plan's own changes on top.
export function planNeeds(template: Need[], plan: Need[]): Need[] {
  const merged = new Map(template.map((need) => [need.positionId, need]));
  for (const need of plan) merged.set(need.positionId, need);
  return [...merged.values()].filter((need) => need.quantity > 0);
}

// The next free number for a second of a position: Guitar, then Guitar 2, then Guitar 3.
export function anotherPositionName(name: string, taken: string[]) {
  const base = name.replace(/\s+\d+$/, "");
  let number = 2;
  while (taken.includes(`${base} ${number}`)) number++;
  return `${base} ${number}`;
}

// The question asked before anything is put on a plan.
export function aboutToSchedule(positions: number, services: number) {
  return `About to auto-schedule ${positions} ${positions === 1 ? "position" : "positions"} across ${services} ${services === 1 ? "service" : "services"}. This can be undone.`;
}

// A service counts as "recent" within this many days either side.
const RECENT_DAYS = 56;
// A person's score starts from how much they've served lately. Lower is better.
const PER_RECENT_SERVICE = 10;
// Points off for each week since they last served, up to MAX_REST_WEEKS.
const PER_REST_WEEK = 1;
const MAX_REST_WEEKS = 12;
// A preferred partner already on the plan outweighs about two recent services.
const PARTNER_ON_PLAN = 25;
// An always-together partner already on the plan comes before everyone.
const ALWAYS_PARTNER_ON_PLAN = 1000;

export function weekOfMonth(date: string) {
  return Math.ceil(Number(date.slice(8, 10)) / 7);
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

export function describeWeeks(weeks: number[]) {
  return [...weeks]
    .sort()
    .map((week) => ORDINALS[week - 1])
    .join(", ");
}

function dayNumber(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

// Everyone joined by "always together", directly or through someone else.
function alwaysGroups(partners: AutoPartner[]) {
  const groups = new Map<string, Set<string>>();
  for (const { a, b, always } of partners) {
    if (!always) continue;
    const merged = new Set([...(groups.get(a) ?? [a]), ...(groups.get(b) ?? [b])]);
    for (const id of merged) groups.set(id, merged);
  }
  return groups;
}

export function autoSchedule(input: {
  plans: AutoPlan[];
  people: AutoPerson[];
  partners: AutoPartner[];
  // The days each person is already serving, past and future, on any plan.
  serving: { personId: string; date: string }[];
}): AutoPlanResult[] {
  const people = new Map(input.people.map((person) => [person.id, person]));
  const groups = alwaysGroups(input.partners);
  const partnersOf = (id: string) => input.partners.filter((p) => p.a === id || p.b === id).map((p) => ({ id: p.a === id ? p.b : p.a, always: p.always }));

  const serving = new Map<string, Set<string>>();
  const addServing = (personId: string, date: string) => serving.set(personId, (serving.get(personId) ?? new Set()).add(date));
  for (const { personId, date } of input.serving) addServing(personId, date);

  const results: AutoPlanResult[] = [];
  for (const plan of [...input.plans].sort((a, b) => a.date.localeCompare(b.date))) {
    const on = new Set(plan.on);
    const declined = new Set(plan.declined);
    const open = new Map(plan.open.filter((spot) => spot.count > 0).map((spot) => [spot.positionId, spot.count]));
    const used = new Set(plan.used);
    const optional = new Set(plan.open.filter((spot) => spot.optional).map((spot) => spot.positionId));
    const placed: AutoPlacement[] = [];

    // Why this person can't serve on this plan, or null if they can.
    const cannotServe = (person: AutoPerson) => {
      if (on.has(person.id)) return "already on this service";
      if (declined.has(person.id)) return "said no to this service";
      const dates = serving.get(person.id);
      if (dates?.has(plan.date)) return "on another service that day";
      if (person.blackouts.some((b) => b.start <= plan.date && plan.date <= b.end)) return "blocked out";
      if (person.weeks.length > 0 && !person.weeks.includes(weekOfMonth(plan.date))) return `only serving the ${describeWeeks(person.weeks)} week`;
      if (person.maxPerMonth !== null) {
        const month = plan.date.slice(0, 7);
        const count = [...(dates ?? [])].filter((date) => date.startsWith(month)).length;
        if (count >= person.maxPerMonth) return `at their limit of ${person.maxPerMonth} a month`;
      }
      return null;
    };

    // The rest of `person`'s always-together group this plan still needs. Someone
    // whose positions this service doesn't use can't join, so they hold nobody back.
    const companions = (person: AutoPerson) =>
      [...(groups.get(person.id) ?? [])]
        .filter((id) => id !== person.id && !on.has(id))
        .map((id) => people.get(id))
        .filter((other): other is AutoPerson => !!other && other.positionIds.some((id) => used.has(id)));

    // A spot for each of `left`, given what's still open. Null if they can't all fit.
    const seat = (left: AutoPerson[], spots: Map<string, number>): Map<string, string> | null => {
      if (left.length === 0) return new Map();
      const [next, ...rest] = left;
      for (const positionId of next.positionIds) {
        const count = spots.get(positionId) ?? 0;
        if (count === 0) continue;
        const seated = seat(rest, new Map(spots).set(positionId, count - 1));
        if (seated) return seated.set(next.id, positionId);
      }
      return null;
    };

    // Who else has to come with this person into this position, or why they can't.
    const together = (person: AutoPerson, positionId: string): Map<string, string> | string => {
      const others = companions(person);
      for (const other of others) {
        const reason = cannotServe(other);
        if (reason) return `always serves with ${other.name}, who is ${reason}`;
      }
      const spots = new Map(open).set(positionId, (open.get(positionId) ?? 1) - 1);
      return seat(others, spots) ?? `always serves with ${others.map((o) => o.name).join(" and ")}, and there's no open spot`;
    };

    const canTake = (person: AutoPerson, positionId: string) => !cannotServe(person) && typeof together(person, positionId) !== "string";

    const score = (person: AutoPerson) => {
      const today = dayNumber(plan.date);
      const gaps = [...(serving.get(person.id) ?? [])].map((date) => Math.abs(dayNumber(date) - today));
      const recent = gaps.filter((gap) => gap < RECENT_DAYS).length;
      const restWeeks = Math.min(MAX_REST_WEEKS, Math.floor(Math.min(Infinity, ...gaps) / 7));
      const partnerBonus = partnersOf(person.id)
        .filter((partner) => on.has(partner.id))
        .reduce((best, partner) => Math.max(best, partner.always ? ALWAYS_PARTNER_ON_PLAN : PARTNER_ON_PLAN), 0);
      return recent * PER_RECENT_SERVICE - restWeeks * PER_REST_WEEK - partnerBonus;
    };

    const holders = (positionId: string) => input.people.filter((person) => person.positionIds.includes(positionId));

    const place = (person: AutoPerson, positionId: string) => {
      on.add(person.id);
      addServing(person.id, plan.date);
      open.set(positionId, (open.get(positionId) ?? 1) - 1);
      placed.push({ personId: person.id, positionId, with: [] });
    };

    // Needed positions before optional ones, and the hardest of those first, so someone
    // who could do either goes where they're needed.
    for (;;) {
      const choices = [...open]
        .filter(([, count]) => count > 0)
        .map(([positionId]) => ({ positionId, people: holders(positionId).filter((person) => canTake(person, positionId)) }))
        .filter((choice) => choice.people.length > 0)
        .sort((a, b) => Number(optional.has(a.positionId)) - Number(optional.has(b.positionId)) || a.people.length - b.people.length);
      if (choices.length === 0) break;

      const { positionId, people: candidates } = choices[0];
      const [{ person }] = candidates.map((person) => ({ person, score: score(person) })).sort((a, b) => a.score - b.score || a.person.name.localeCompare(b.person.name));
      const seated = together(person, positionId) as Map<string, string>;
      place(person, positionId);
      for (const [id, seatedPosition] of seated) place(people.get(id) as AutoPerson, seatedPosition);
    }

    for (const placement of placed) {
      placement.with = partnersOf(placement.personId)
        .filter((partner) => on.has(partner.id))
        .map((partner) => people.get(partner.id)?.name ?? "Someone");
    }

    const stillOpen = [...open]
      .filter(([, count]) => count > 0)
      .map(([positionId, count]) => {
        const why = holders(positionId)
          .map((person) => `${person.name}: ${cannotServe(person) ?? together(person, positionId)}`)
          .sort();
        return { positionId, count, optional: optional.has(positionId), why: why.length > 0 ? why : ["No one has this position yet."] };
      });

    results.push({ planId: plan.id, placed, open: stillOpen });
  }
  return results;
}
