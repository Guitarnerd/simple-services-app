// Turns a song's files and links into things the player can play.
// Safe to import anywhere.

import { youtubeId } from "@/lib/format";
import type { Source } from "@/components/player";

type Playable = { id: string; kind: "FILE" | "LINK"; name: string; url: string | null; contentType: string | null };

export function sourceFor(attachment: Playable): Source | null {
  if (attachment.kind === "FILE") {
    return attachment.contentType?.startsWith("audio/") ? { kind: "audio", label: attachment.name, src: `/files/${attachment.id}` } : null;
  }
  const video = attachment.url ? youtubeId(attachment.url) : null;
  return video ? { kind: "youtube", label: attachment.name, src: video } : null;
}

// Uploaded recordings come first: they keep playing with the screen locked,
// which YouTube does not allow.
export function sourcesFor(attachments: Playable[]): Source[] {
  const sources = attachments.map(sourceFor).filter((s): s is Source => s !== null);
  return [...sources.filter((s) => s.kind === "audio"), ...sources.filter((s) => s.kind === "youtube")];
}
