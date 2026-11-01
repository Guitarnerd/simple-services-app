import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Page } from "@/components/page";
import { ChartEditor } from "@/components/chart-editor";

export const metadata: Metadata = { title: "Edit chord chart" };

export default async function EditChartPage({ params }: PageProps<"/songs/[id]/chart/[arrangementId]/edit">) {
  const { id, arrangementId } = await params;
  const user = await requireRole("PLANNER");

  const arrangement = await prisma.arrangement.findFirst({
    where: { id: arrangementId, songId: id, song: { organizationId: user.organizationId } },
    include: { song: { include: { _count: { select: { arrangements: true } } } } },
  });
  if (!arrangement) notFound();

  return (
    <Page
      wide
      hideTitleInPrint
      title={`${arrangement.song.title} chart`}
      subtitle={arrangement.song._count.arrangements > 1 ? arrangement.name : undefined}
      back={{ href: `/songs/${id}`, label: arrangement.song.title }}
      actions={
        <Link href={`/songs/${id}/chart/${arrangementId}`} className="btn btn-secondary">
          View chart
        </Link>
      }
    >
      <ChartEditor
        songId={id}
        arrangementId={arrangementId}
        title={arrangement.song.title}
        author={arrangement.song.author}
        initialText={arrangement.chart ?? ""}
        // A new chart starts in the arrangement's key.
        initialKey={arrangement.chartKey ?? (arrangement.chart ? "" : (arrangement.key ?? ""))}
      />
    </Page>
  );
}
