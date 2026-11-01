// Turns a Planning Center person, and the records included with them, into what a Person
// here holds. Pure, so it can be tested without Planning Center.

export type PcoResource = { id: string; type: string; attributes: Record<string, unknown>; relationships?: Record<string, { data: { id: string; type: string } | { id: string; type: string }[] | null }> };

export type PcoContact = {
  email: string | null;
  phones: { number: string; label: string; isPrimary: boolean }[];
  birthday: Date | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function related(person: PcoResource, name: string, type: string, included: Map<string, PcoResource>) {
  const data = person.relationships?.[name]?.data;
  return (Array.isArray(data) ? data : []).map((row) => included.get(`${type}:${row.id}`)).filter((row): row is PcoResource => Boolean(row));
}

const primaryFirst = (rows: PcoResource[]) => [...rows].sort((a, b) => Number(Boolean(b.attributes.primary)) - Number(Boolean(a.attributes.primary)));

export function readContact(person: PcoResource, included: Map<string, PcoResource>): PcoContact {
  const emails = primaryFirst(related(person, "emails", "Email", included));
  const phones = related(person, "phone_numbers", "PhoneNumber", included).filter((phone) => text(phone.attributes.number));
  const address = primaryFirst(related(person, "addresses", "Address", included))[0]?.attributes;

  const birthdate = text(person.attributes.birthdate);
  const birthday = birthdate && /^\d{4}-\d{2}-\d{2}/.test(birthdate) ? new Date(`${birthdate.slice(0, 10)}T00:00:00Z`) : null;
  const street = address ? [text(address.street_line_1) ?? text(address.street), text(address.street_line_2)].filter(Boolean).join(", ") : "";

  return {
    email: text(emails[0]?.attributes.address)?.toLowerCase() ?? null,
    phones: phones.map((phone, n) => ({
      number: text(phone.attributes.number) as string,
      label: text(phone.attributes.location) ?? "Mobile",
      isPrimary: phones.some((p) => p.attributes.primary) ? Boolean(phone.attributes.primary) : n === 0,
    })),
    birthday: birthday && !Number.isNaN(birthday.getTime()) ? birthday : null,
    street: street || null,
    city: address ? text(address.city) : null,
    state: address ? text(address.state) : null,
    postalCode: address ? text(address.zip) : null,
  };
}
