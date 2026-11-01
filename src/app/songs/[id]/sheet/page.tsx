import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { sourcesFor } from "@/lib/tracks";
import { abbreviateSequence } from "@/lib/sequence";
import { SetlistViewer, type SetlistSong } from "@/components/setlist-viewer";
import type { Track } from "@/components/player";

export async function generateMetadata({ params }: PageProps<"/songs/[id]/sheet">): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const song = await prisma.song.findFirst({ where: { id, organizationId: user.organizationId }, select: { title: true } });
  return { title: song?.title ?? "Song sheet" };
}

// One song as it looks in a set list: where a song opens from the song list.
// A song with several arrangements has a page for each, to move between.
export default async function SongSheetPage({ params }: PageProps<"/songs/[id]/sheet">) {
  const { id } = await params;
  const user = await getCurrentUser();

  const song = await prisma.song.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { arrangements: { orderBy: { sortOrder: "asc" } }, attachments: { orderBy: { createdAt: "asc" } } },
  });
  if (!song) notFound();

  const canEdit = hasRole(user.role, "PLANNER");
  const tracks: Track[] = [];
  const pages: SetlistSong[] = song.arrangements.map((arrangement) => {
    // Files and links for this arrangement, plus any that apply to every arrangement.
    const attachments = song.attachments.filter((a) => !a.arrangementId || a.arrangementId === arrangement.id);
    const sources = sourcesFor(attachments);
    if (sources.length > 0) tracks.push({ id: arrangement.id, title: song.title, sources });

    return {
      id: arrangement.id,
      title: song.arrangements.length > 1 ? `${song.title} (${arrangement.name})` : song.title,
      author: song.author,
      key: arrangement.key,
      details: [arrangement.bpm && `${arrangement.bpm} BPM`, arrangement.meter].filter(Boolean).join(" · ") || null,
      sequence: abbreviateSequence(arrangement.sequence) || null,
      notes: arrangement.notes,
      chart: arrangement.chart,
      chartKey: arrangement.chartKey,
      files: attachments
        .filter((a) => a.kind === "FILE" && (a.contentType === "application/pdf" || a.contentType?.startsWith("image/")))
        .map((a) => ({ id: a.id, name: a.name, isImage: Boolean(a.contentType?.startsWith("image/")) })),
      trackIndex: sources.length > 0 ? tracks.length - 1 : null,
      // Under the sheet: on to editing for those who may, and to printing and the song's own page for everyone.
      actions: [
        ...(canEdit ? [{ label: arrangement.chart ? "Edit song sheet" : "Type a song sheet", href: `/songs/${song.id}/chart/${arrangement.id}/edit` }] : []),
        { label: canEdit ? "Edit song details" : "Song details, files and links", href: `/songs/${song.id}` },
        ...(arrangement.chart ? [{ label: "Print or change key", href: `/songs/${song.id}/chart/${arrangement.id}` }] : []),
      ],
    };
  });

  return <SetlistViewer back={{ href: "/songs", label: "Songs" }} heading={song.author ?? ""} songs={pages} tracks={tracks} />;
}
