import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { describeService, visiblePlans } from "@/lib/schedule";
import { sourcesFor } from "@/lib/tracks";
import { abbreviateSequence } from "@/lib/sequence";
import { SetlistViewer, type SetlistSong } from "@/components/setlist-viewer";
import type { Track } from "@/components/player";

export const metadata: Metadata = { title: "Set list" };

export default async function SetlistPage({ params, searchParams }: PageProps<"/plans/[id]/setlist">) {
  const { id } = await params;
  const { song: startSong } = await searchParams;
  const user = await getCurrentUser();

  const plan = await prisma.plan.findFirst({
    where: { id, ...visiblePlans(user) },
    include: {
      serviceType: true,
      items: {
        where: { type: "SONG" },
        orderBy: { position: "asc" },
        include: { arrangement: true, song: { include: { attachments: { orderBy: { createdAt: "asc" } } } } },
      },
    },
  });
  if (!plan) notFound();

  const tracks: Track[] = [];
  const songs: SetlistSong[] = plan.items.map((item) => {
    // Files and links for this arrangement, plus any that apply to every arrangement.
    const attachments = (item.song?.attachments ?? []).filter((a) => !a.arrangementId || a.arrangementId === item.arrangementId);
    const sources = sourcesFor(attachments);
    if (sources.length > 0) tracks.push({ id: item.id, title: item.title, sources });

    return {
      id: item.id,
      title: item.title,
      tag: item.tag,
      author: item.song?.author ?? null,
      key: item.key,
      details: [item.arrangement?.bpm && `${item.arrangement.bpm} BPM`, item.arrangement?.meter].filter(Boolean).join(" · ") || null,
      sequence: abbreviateSequence(item.arrangement?.sequence) || null,
      notes: item.notes,
      chart: item.arrangement?.chart ?? null,
      chartKey: item.arrangement?.chartKey ?? null,
      files: attachments
        .filter((a) => a.kind === "FILE" && (a.contentType === "application/pdf" || a.contentType?.startsWith("image/")))
        .map((a) => ({ id: a.id, name: a.name, isImage: Boolean(a.contentType?.startsWith("image/")) })),
      trackIndex: sources.length > 0 ? tracks.length - 1 : null,
    };
  });

  const startAt = Math.max(0, songs.findIndex((song) => song.id === startSong));
  return <SetlistViewer back={{ href: `/plans/${plan.id}`, label: "Plan" }} heading={describeService(plan)} songs={songs} tracks={tracks} startAt={startAt} />;
}
