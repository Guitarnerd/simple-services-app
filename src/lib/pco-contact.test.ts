import { test } from "node:test";
import assert from "node:assert/strict";
import { readContact, type PcoResource } from "./pco-contact";

const row = (type: string, id: string, attributes: Record<string, unknown>): PcoResource => ({ id, type, attributes });
const person = (attributes: Record<string, unknown>, links: Record<string, [string, string][]>): PcoResource => ({
  id: "1",
  type: "Person",
  attributes,
  relationships: Object.fromEntries(Object.entries(links).map(([name, rows]) => [name, { data: rows.map(([type, id]) => ({ type, id })) }])),
});
const map = (rows: PcoResource[]) => new Map(rows.map((r) => [`${r.type}:${r.id}`, r]));

test("reads a whole contact, primary details first", () => {
  const contact = readContact(
    person({ birthdate: "1980-05-01" }, { emails: [["Email", "1"], ["Email", "2"]], phone_numbers: [["PhoneNumber", "1"], ["PhoneNumber", "2"]], addresses: [["Address", "1"], ["Address", "2"]] }),
    map([
      row("Email", "1", { address: "OLD@example.org", primary: false }),
      row("Email", "2", { address: "New@Example.org", primary: true }),
      row("PhoneNumber", "1", { number: "555-0100", location: "Home", primary: false }),
      row("PhoneNumber", "2", { number: "555-0101", location: "Mobile", primary: true }),
      row("Address", "1", { street_line_1: "1 Old Rd", city: "Oldtown", state: "TX", zip: "00001", primary: false }),
      row("Address", "2", { street_line_1: "2 Main St", street_line_2: "Apt 3", city: "Newtown", state: "OK", zip: "00002", primary: true }),
    ])
  );
  assert.equal(contact.email, "new@example.org");
  assert.deepEqual(contact.phones, [
    { number: "555-0100", label: "Home", isPrimary: false },
    { number: "555-0101", label: "Mobile", isPrimary: true },
  ]);
  assert.equal(contact.birthday?.toISOString().slice(0, 10), "1980-05-01");
  assert.equal(contact.street, "2 Main St, Apt 3");
  assert.equal(contact.city, "Newtown");
  assert.equal(contact.state, "OK");
  assert.equal(contact.postalCode, "00002");
});

test("the older one-line street works too", () => {
  const contact = readContact(person({}, { addresses: [["Address", "1"]] }), map([row("Address", "1", { street: "9 Elm", city: "X" })]));
  assert.equal(contact.street, "9 Elm");
});

test("the first phone is primary when none says so", () => {
  const contact = readContact(person({}, { phone_numbers: [["PhoneNumber", "1"], ["PhoneNumber", "2"]] }), map([row("PhoneNumber", "1", { number: "1" }), row("PhoneNumber", "2", { number: "2" })]));
  assert.deepEqual(contact.phones.map((p) => p.isPrimary), [true, false]);
});

test("someone with nothing on file comes through empty", () => {
  assert.deepEqual(readContact(person({ birthdate: null }, {}), new Map()), { email: null, phones: [], birthday: null, street: null, city: null, state: null, postalCode: null });
});
