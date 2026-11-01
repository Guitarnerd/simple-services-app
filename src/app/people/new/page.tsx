import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { Page } from "@/components/page";
import { PersonForm } from "@/components/person-form";

export const metadata: Metadata = { title: "Add person" };

export default async function NewPersonPage() {
  await requireRole("PLANNER");

  return (
    <Page title="Add person" back={{ href: "/people", label: "People" }}>
      <PersonForm
        showNotes
        person={{
          firstName: "",
          lastName: "",
          email: "",
          birthday: "",
          street: "",
          city: "",
          state: "",
          postalCode: "",
          notes: "",
          phones: [],
        }}
      />
    </Page>
  );
}
