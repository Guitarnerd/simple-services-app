import { test } from "node:test";
import assert from "node:assert/strict";
import { churchChecks, siteChecks, stepsLeft, type SetupFacts } from "./setup-checks";

const empty: SetupFacts = {
  emailKey: false,
  emailFrom: false,
  appUrl: null,
  fileStorage: false,
  reminders: false,
  logo: false,
  ccliLicense: false,
  teamsWithPositions: 0,
  serviceTypesWithPositions: 0,
  songs: 0,
  plans: 0,
  imported: 0,
  people: 1,
  logins: 1,
};

const done = (checks: { id: string; done: boolean }[], id: string) => checks.find((check) => check.id === id)?.done;

test("a new site has everything left, and optional steps don't count", () => {
  assert.equal(stepsLeft(siteChecks(empty)), 4);
  assert.equal(stepsLeft(churchChecks(empty)), 3);
});

test("an address has to be a real one", () => {
  assert.equal(done(siteChecks({ ...empty, appUrl: "http://localhost:3100" }), "address"), false);
  assert.equal(done(siteChecks({ ...empty, appUrl: "https://localhost:3100" }), "address"), false);
  assert.equal(done(siteChecks({ ...empty, appUrl: "https://services.example.org" }), "address"), true);
});

test("email needs both the key and the sender", () => {
  assert.equal(done(siteChecks({ ...empty, emailKey: true }), "email"), false);
  assert.equal(done(siteChecks({ ...empty, emailKey: true, emailFrom: true }), "email"), true);
});

test("the first admin alone doesn't count as an invited team", () => {
  assert.equal(done(churchChecks(empty), "invite"), false);
  assert.equal(done(churchChecks({ ...empty, logins: 2 }), "invite"), true);
});

test("a finished site has nothing left", () => {
  const facts = { ...empty, emailKey: true, emailFrom: true, appUrl: "https://a.example", fileStorage: true, reminders: true, teamsWithPositions: 1, serviceTypesWithPositions: 1, logins: 2 };
  assert.equal(stepsLeft(siteChecks(facts)) + stepsLeft(churchChecks(facts)), 0);
});
