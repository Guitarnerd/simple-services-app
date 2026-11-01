import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { planBackLink } from "@/lib/schedule";
import { Page } from "@/components/page";
import { abbreviateSequence } from "@/lib/sequence";
import { ChartViewer } from "@/components/chart-viewer";

export const metadata: Metadata = { title: "Chord chart" };

export default async function ChartPage({ params, searchParams }: PageProps<"/songs/[id]/chart/[arrangementId]">) {
  const { id, arrangementId } = await params;
  const { key, plan: fromPlan } = await searchParams;
  const user = await getCurrentUser();

  const arrangement = await prisma.arrangement.findFirst({
    where: { id: arrangementId, songId: id, song: { organizationId: user.organizationId } },
    include: { song: { include: { _count: { select: { arrangements: true } } } } },
  });
  if (!arrangement) notFound();
  const planLink = await planBackLink(user, fromPlan);

  const canEdit = hasRole(user.role, "PLANNER");
  const editHref = `/songs/${id}/chart/${arrangementId}/edit`;
  const details = [
    arrangement.song.author,
    arrangement.song._count.arrangements > 1 && arrangement.name,
    arrangement.bpm && `${arrangement.bpm} BPM`,
    arrangement.meter,
  ].filter(Boolean);

  return (
    <Page
      hideTitleInPrint
      title={arrangement.song.title}
      subtitle={details.join(" · ") || undefined}
      // Reached from the song's sheet, so that is the way back.
      back={planLink ?? { href: `/songs/${id}/sheet`, label: "Song sheet" }}
    >
      {arrangement.chart ? (
        <section className="card">
          <ChartViewer
            text={arrangement.chart}
            chartKey={arrangement.chartKey}
            initialKey={typeof key === "string" ? key : null}
            title={arrangement.song.title}
            author={arrangement.song.author}
            sequence={abbreviateSequence(arrangement.sequence) || null}
          />
        </section>
      ) : (
        <section className="card">
          <p className="muted text-sm">No song sheet has been typed for this arrangement yet.</p>
        </section>
      )}

      {/* Under the sheet: on to editing for those who may, and to the song's own page for everyone. */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {canEdit && (
          <Link href={editHref} className={`btn ${arrangement.chart ? "btn-secondary" : "btn-primary"}`}>
            {arrangement.chart ? "Edit song sheet" : "Type a song sheet"}
          </Link>
        )}
        <Link href={`/songs/${id}${typeof fromPlan === "string" ? `?plan=${fromPlan}` : ""}`} className="btn btn-secondary">
          {canEdit ? "Edit song details" : "Song details, files and links"}
        </Link>
      </div>
    </Page>
  );
}
