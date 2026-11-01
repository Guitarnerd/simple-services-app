import { test } from "node:test";
import assert from "node:assert/strict";
import { aboutToSchedule, anotherPositionName, autoSchedule, describeWeeks, planNeeds, weekOfMonth, type AutoPerson, type AutoPlan } from "./auto-schedule";

function person(id: string, positionIds: string[], more: Partial<AutoPerson> = {}): AutoPerson {
  return { id, name: id, positionIds, maxPerMonth: null, weeks: [], blackouts: [], ...more };
}

function plan(id: string, date: string, open: Record<string, number>, more: Partial<AutoPlan> = {}): AutoPlan {
  return { id, date, open: Object.entries(open).map(([positionId, count]) => ({ positionId, count })), used: Object.keys(open), on: [], declined: [], ...more };
}

const placedIn = (result: { placed: { personId: string; positionId: string }[] }) => result.placed.map((p) => `${p.personId}:${p.positionId}`).sort();

test("weekOfMonth counts sevens of days", () => {
  assert.equal(weekOfMonth("2026-11-01"), 1);
  assert.equal(weekOfMonth("2026-11-07"), 1);
  assert.equal(weekOfMonth("2026-11-08"), 2);
  assert.equal(weekOfMonth("2026-11-29"), 5);
  assert.equal(describeWeeks([5, 1]), "1st, 5th");
});

test("a plan's own needs add to, change, or take away from its service type's", () => {
  const template = [
    { positionId: "sound", quantity: 1, optional: false },
    { positionId: "video", quantity: 1, optional: false },
    { positionId: "lights", quantity: 2, optional: false },
  ];
  const plan = [
    { positionId: "video", quantity: 0, optional: false },
    { positionId: "lights", quantity: 1, optional: true },
    { positionId: "keys", quantity: 1, optional: false },
  ];
  assert.deepEqual(planNeeds(template, plan), [
    { positionId: "sound", quantity: 1, optional: false },
    { positionId: "lights", quantity: 1, optional: true },
    { positionId: "keys", quantity: 1, optional: false },
  ]);
});

test("a second of a position takes the next free number", () => {
  assert.equal(anotherPositionName("Guitar", ["Guitar"]), "Guitar 2");
  assert.equal(anotherPositionName("Guitar", ["Guitar", "Guitar 2"]), "Guitar 3");
  assert.equal(anotherPositionName("Guitar 2", ["Guitar", "Guitar 2"]), "Guitar 3");
  assert.equal(anotherPositionName("Guitar", ["Guitar", "Guitar 3"]), "Guitar 2");
});

test("the confirmation counts positions and services", () => {
  assert.equal(aboutToSchedule(12, 4), "About to auto-schedule 12 positions across 4 services. This can be undone.");
  assert.equal(aboutToSchedule(1, 1), "About to auto-schedule 1 position across 1 service. This can be undone.");
});

test("takes turns: whoever served least goes next", () => {
  const results = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1 }), plan("p2", "2026-11-08", { sound: 1 }), plan("p3", "2026-11-15", { sound: 1 })],
    people: [person("Ann", ["sound"]), person("Bob", ["sound"]), person("Cy", ["sound"])],
    partners: [],
    serving: [{ personId: "Ann", date: "2026-10-25" }],
  });
  assert.deepEqual(
    results.map((r) => r.placed[0].personId),
    ["Bob", "Cy", "Ann"]
  );
});

test("nobody serves a day they're blocked out, and the reason is given", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1 })],
    people: [person("Ann", ["sound"], { blackouts: [{ start: "2026-10-30", end: "2026-11-02" }] })],
    partners: [],
    serving: [],
  });
  assert.equal(result.placed.length, 0);
  assert.deepEqual(result.open, [{ positionId: "sound", count: 1, optional: false, why: ["Ann: blocked out"] }]);
});

test("a monthly limit counts days already scheduled and days placed in the run", () => {
  const results = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1 }), plan("p2", "2026-11-08", { sound: 1 }), plan("p3", "2026-12-06", { sound: 1 })],
    people: [person("Ann", ["sound"], { maxPerMonth: 1 })],
    partners: [],
    serving: [],
  });
  assert.equal(results[0].placed.length, 1);
  assert.equal(results[1].placed.length, 0);
  assert.match(results[1].open[0].why[0], /limit of 1 a month/);
  assert.equal(results[2].placed.length, 1);
});

test("weeks of the month are kept to", () => {
  const results = autoSchedule({
    plans: [plan("p1", "2026-11-22", { sound: 1 }), plan("p2", "2026-11-29", { sound: 1 })],
    people: [person("Ann", ["sound"], { weeks: [5] })],
    partners: [],
    serving: [],
  });
  assert.equal(results[0].placed.length, 0);
  assert.equal(results[1].placed.length, 1);
});

test("someone who said no, or is on another plan that day, isn't placed", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1, video: 1 }, { declined: ["Ann"] })],
    people: [person("Ann", ["sound"]), person("Bob", ["video"])],
    partners: [],
    serving: [{ personId: "Bob", date: "2026-11-01" }],
  });
  assert.equal(result.placed.length, 0);
});

test("one service, one position each", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1, video: 1 })],
    people: [person("Ann", ["sound", "video"])],
    partners: [],
    serving: [],
  });
  assert.equal(result.placed.length, 1);
  assert.equal(result.open.length, 1);
});

test("the position with the fewest people goes first, so everyone fits", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1, video: 1 })],
    people: [person("Ann", ["sound", "video"]), person("Bob", ["sound"])],
    partners: [],
    serving: [],
  });
  assert.deepEqual(placedIn(result), ["Ann:video", "Bob:sound"]);
});

test("needed positions go before optional ones, however hard they are to fill", () => {
  const [result] = autoSchedule({
    plans: [
      {
        ...plan("p1", "2026-11-01", {}),
        open: [
          { positionId: "video", count: 1, optional: true },
          { positionId: "sound", count: 1 },
        ],
        used: ["video", "sound"],
      },
    ],
    // Only Ann can do video, and Ben and Ann can both do sound.
    people: [person("Ann", ["video", "sound"]), person("Ben", ["sound"], { blackouts: [{ start: "2026-11-01", end: "2026-11-01" }] })],
    partners: [],
    serving: [],
  });
  assert.deepEqual(placedIn(result), ["Ann:sound"]);
  assert.equal(result.open[0].optional, true);
});

test("always together: both are placed, in their own positions", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1, keys: 1 })],
    people: [person("Dad", ["keys"]), person("Son", ["sound"]), person("Zed", ["sound"])],
    partners: [{ a: "Dad", b: "Son", always: true }],
    // Zed would otherwise be next up for sound.
    serving: [{ personId: "Son", date: "2026-10-25" }],
  });
  assert.deepEqual(placedIn(result), ["Dad:keys", "Son:sound"]);
  assert.deepEqual(
    result.placed.map((p) => p.with),
    [["Son"], ["Dad"]]
  );
});

test("always together: if one can't serve, neither is placed", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1, keys: 1 })],
    people: [person("Dad", ["keys"]), person("Son", ["sound"], { blackouts: [{ start: "2026-11-01", end: "2026-11-01" }] })],
    partners: [{ a: "Dad", b: "Son", always: true }],
    serving: [],
  });
  assert.equal(result.placed.length, 0);
  assert.ok(result.open.find((o) => o.positionId === "keys")?.why[0].includes("always serves with Son, who is blocked out"));
});

test("always together: one already on the plan brings the other", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1 }, { used: ["sound", "keys"], on: ["Dad"] })],
    people: [person("Dad", ["keys"]), person("Son", ["sound"]), person("Abe", ["sound"])],
    partners: [{ a: "Dad", b: "Son", always: true }],
    serving: [{ personId: "Son", date: "2026-10-25" }],
  });
  assert.deepEqual(placedIn(result), ["Son:sound"]);
});

test("always together: a partner whose positions this service doesn't use holds nobody back", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1 })],
    people: [person("Dad", ["nursery"]), person("Son", ["sound"])],
    partners: [{ a: "Dad", b: "Son", always: true }],
    serving: [],
  });
  assert.deepEqual(placedIn(result), ["Son:sound"]);
});

test("always together holds for three, and they need a spot each", () => {
  const people = [person("Dad", ["sound"]), person("Son", ["sound"]), person("Kid", ["sound"])];
  const partners = [
    { a: "Dad", b: "Son", always: true },
    { a: "Son", b: "Kid", always: true },
  ];
  const [full] = autoSchedule({ plans: [plan("p1", "2026-11-01", { sound: 2 })], people, partners, serving: [] });
  assert.equal(full.placed.length, 0);
  const [fits] = autoSchedule({ plans: [plan("p1", "2026-11-01", { sound: 3 })], people, partners, serving: [] });
  assert.equal(fits.placed.length, 3);
});

test("prefer together: a partner on the plan beats a small difference in turns", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1 }, { used: ["sound", "keys"], on: ["Amy"] })],
    people: [person("Amy", ["keys"]), person("Ben", ["sound"]), person("Cal", ["sound"])],
    partners: [{ a: "Amy", b: "Ben", always: false }],
    serving: [{ personId: "Ben", date: "2026-10-18" }],
  });
  assert.deepEqual(placedIn(result), ["Ben:sound"]);
  assert.deepEqual(result.placed[0].with, ["Amy"]);
});

test("prefer together isn't a rule: they serve apart when one can't", () => {
  const [result] = autoSchedule({
    plans: [plan("p1", "2026-11-01", { sound: 1, keys: 1 })],
    people: [person("Amy", ["keys"], { blackouts: [{ start: "2026-11-01", end: "2026-11-01" }] }), person("Ben", ["sound"])],
    partners: [{ a: "Amy", b: "Ben", always: false }],
    serving: [],
  });
  assert.deepEqual(placedIn(result), ["Ben:sound"]);
});

test("a position nobody holds says so", () => {
  const [result] = autoSchedule({ plans: [plan("p1", "2026-11-01", { sound: 1 })], people: [], partners: [], serving: [] });
  assert.deepEqual(result.open[0].why, ["No one has this position yet."]);
});
