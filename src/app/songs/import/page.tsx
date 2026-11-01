import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { Page } from "@/components/page";
import { ImportSongsForm } from "./import-songs-form";

export const metadata: Metadata = { title: "Import songs" };

export default async function ImportSongsPage() {
  await requireRole("PLANNER");

  return (
    <Page title="Import songs" subtitle="Add songs from files, such as chord charts downloaded from SongSelect." back={{ href: "/songs", label: "Songs" }}>
      <section className="panel">
        <h2 className="panel-head">From SongSelect</h2>
        <div className="panel-body flex flex-col gap-4">
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>
              Sign in at{" "}
              <a href="https://songselect.ccli.com" target="_blank" rel="noopener noreferrer" className="link">
                SongSelect
              </a>{" "}
              with your church&apos;s account and open a song.
            </li>
            <li>Choose Chords, then Download, then ChordPro. Not every song offers it, and it takes a Premium subscription.</li>
            <li>Choose the downloaded files below. You can pick several at once.</li>
          </ol>
          <ImportSongsForm />
          <p className="muted text-xs">Each song comes in with its title, writers, key, CCLI number and chart. A song you already have is left alone. Your church&apos;s subscription decides what you may download and use.</p>
        </div>
      </section>
    </Page>
  );
}
