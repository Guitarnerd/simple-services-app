import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { Page } from "@/components/page";
import { NewSongForm } from "@/components/song-forms";

export const metadata: Metadata = { title: "Add song" };

export default async function NewSongPage() {
  await requireRole("PLANNER");

  return (
    <Page title="Add song" subtitle="You can upload charts and add links on the next screen." back={{ href: "/songs", label: "Songs" }}>
      <NewSongForm />
    </Page>
  );
}
