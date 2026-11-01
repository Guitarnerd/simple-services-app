"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { parseLength } from "@/lib/format";
import { guessKey, parseKey } from "@/lib/chords";
import { parseSongFile } from "@/lib/song-file";
import { youtubeTitle } from "@/lib/youtube";
import { deleteFile } from "@/lib/storage";
import type { FormState } from "@/components/form";

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim() || null;
}

function readSong(formData: FormData) {
  return {
    title: text(formData, "title"),
    author: text(formData, "author"),
    // Digits only, however it was typed or pasted ("CCLI #1234567").
    ccliNumber: (text(formData, "ccliNumber") ?? "").replace(/\D/g, "").slice(0, 12) || null,
    notes: text(formData, "notes"),
  };
}

function readArrangement(formData: FormData) {
  const bpmText = text(formData, "bpm");
  const bpm = bpmText ? Number(bpmText) : null;
  if (bpm !== null && (!Number.isInteger(bpm) || bpm < 20 || bpm > 400)) {
    return { error: "BPM should be a whole number between 20 and 400." };
  }
  const lengthSeconds = parseLength(String(formData.get("length") ?? ""));
  if (Number.isNaN(lengthSeconds)) return { error: "Write the length like 4:30." };

  return {
    data: {
      key: text(formData, "key"),
      bpm,
      meter: text(formData, "meter"),
      lengthSeconds,
      sequence: text(formData, "sequence"),
      notes: text(formData, "arrangementNotes"),
    },
  };
}

export async function createSong(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const { title, ...rest } = readSong(formData);
  if (!title) return { error: "Give the song a title." };

  const arrangement = readArrangement(formData);
  if ("error" in arrangement) return arrangement;

  const song = await prisma.song.create({
    data: {
      ...rest,
      title,
      organizationId: user.organizationId,
      arrangements: { create: { name: "Default", ...arrangement.data } },
    },
  });
  redirect(`/songs/${song.id}`);
}

export async function saveSong(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const songId = String(formData.get("songId") ?? "");
  const { title, ...rest } = readSong(formData);
  if (!title) return { error: "Give the song a title." };

  const { count } = await prisma.song.updateMany({
    where: { id: songId, organizationId: user.organizationId },
    data: { ...rest, title },
  });
  if (count === 0) return { error: "That song no longer exists." };

  // Plan rows keep their own copy of the title, so bring those along.
  await prisma.planItem.updateMany({ where: { songId, title: { not: title } }, data: { title } });

  revalidatePath(`/songs/${songId}`);
  revalidatePath("/plans", "layout");
  revalidatePath("/");
  return { ok: "Saved." };
}

export async function setSongArchived(formData: FormData) {
  const user = await requireRole("PLANNER");
  const songId = String(formData.get("songId") ?? "");
  await prisma.song.updateMany({
    where: { id: songId, organizationId: user.organizationId },
    data: { archived: formData.get("archived") === "true" },
  });
  revalidatePath(`/songs/${songId}`);
}

async function ownedSong(songId: string) {
  const user = await requireRole("PLANNER");
  const song = await prisma.song.findFirst({
    where: { id: songId, organizationId: user.organizationId },
    include: { arrangements: { select: { id: true } } },
  });
  return song ? { user, song } : null;
}

export async function saveArrangement(_prev: FormState, formData: FormData): Promise<FormState> {
  const songId = String(formData.get("songId") ?? "");
  const arrangementId = String(formData.get("arrangementId") ?? "") || null;
  const owned = await ownedSong(songId);
  if (!owned) return { error: "That song no longer exists." };

  const name = text(formData, "name");
  if (!name) return { error: "Give the arrangement a name." };
  const arrangement = readArrangement(formData);
  if ("error" in arrangement) return arrangement;

  if (arrangementId) {
    if (!owned.song.arrangements.some((a) => a.id === arrangementId)) {
      return { error: "That arrangement no longer exists." };
    }
    await prisma.arrangement.update({ where: { id: arrangementId }, data: { name, ...arrangement.data } });
  } else {
    await prisma.arrangement.create({
      data: { songId, name, sortOrder: owned.song.arrangements.length, ...arrangement.data },
    });
  }

  revalidatePath(`/songs/${songId}`);
  return { ok: arrangementId ? "Saved." : "Arrangement added." };
}

export async function saveChart(_prev: FormState, formData: FormData): Promise<FormState> {
  const songId = String(formData.get("songId") ?? "");
  const arrangementId = String(formData.get("arrangementId") ?? "");
  const owned = await ownedSong(songId);
  if (!owned || !owned.song.arrangements.some((a) => a.id === arrangementId)) {
    return { error: "That arrangement no longer exists." };
  }

  const chart = String(formData.get("chart") ?? "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  if (chart.length > 50_000) return { error: "That chart is too long to save." };
  const chartKey = text(formData, "chartKey");
  if (chartKey && !parseKey(chartKey)) return { error: "Pick the key from the list." };

  await prisma.arrangement.update({
    where: { id: arrangementId },
    data: { chart: chart || null, chartKey },
  });

  revalidatePath(`/songs/${songId}`);
  return { ok: "Saved." };
}

// Files and links attached to the arrangement stay on the song.
export async function deleteArrangement(formData: FormData) {
  const songId = String(formData.get("songId") ?? "");
  const arrangementId = String(formData.get("arrangementId") ?? "");
  const owned = await ownedSong(songId);
  if (!owned || owned.song.arrangements.length <= 1) return;
  if (!owned.song.arrangements.some((a) => a.id === arrangementId)) return;

  await prisma.arrangement.delete({ where: { id: arrangementId } });
  revalidatePath(`/songs/${songId}`);
}

export async function addLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const songId = String(formData.get("songId") ?? "");
  const arrangementId = String(formData.get("arrangementId") ?? "") || null;
  const owned = await ownedSong(songId);
  if (!owned) return { error: "That song no longer exists." };
  if (arrangementId && !owned.song.arrangements.some((a) => a.id === arrangementId)) {
    return { error: "That arrangement no longer exists." };
  }

  const rawUrl = text(formData, "url");
  let url: URL;
  try {
    url = new URL(rawUrl ?? "");
  } catch {
    return { error: "Paste a full web address, starting with https://" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "Paste a full web address, starting with https://" };
  }

  const isYouTube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname);
  // With no label given, a YouTube link is named after its video.
  const label = text(formData, "name") ?? (isYouTube ? ((await youtubeTitle(url.toString())) ?? "YouTube") : url.hostname.replace(/^www\./, ""));
  await prisma.attachment.create({
    data: {
      organizationId: owned.user.organizationId,
      songId,
      arrangementId,
      kind: "LINK",
      name: label,
      url: url.toString(),
    },
  });

  revalidatePath(`/songs/${songId}`);
  return { ok: "Link added." };
}

export async function deleteAttachment(formData: FormData) {
  const user = await requireRole("PLANNER");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, organizationId: user.organizationId },
  });
  if (!attachment) return;

  await prisma.attachment.delete({ where: { id: attachment.id } });
  if (attachment.storageKey) await deleteFile(attachment.storageKey);
  revalidatePath(`/songs/${attachment.songId}`);
}

export type LinkSnapshot = { songId: string; arrangementId: string | null; name: string; url: string; keyLabel: string | null };

// Removes a link (not an uploaded file) and hands back what it was, so the
// page can offer Undo.
export async function removeLink(attachmentId: string): Promise<LinkSnapshot | null> {
  const user = await requireRole("PLANNER");
  const link = await prisma.attachment.findFirst({ where: { id: attachmentId, organizationId: user.organizationId, kind: "LINK" } });
  if (!link?.url) return null;

  await prisma.attachment.delete({ where: { id: link.id } });
  revalidatePath(`/songs/${link.songId}`);
  return { songId: link.songId, arrangementId: link.arrangementId, name: link.name, url: link.url, keyLabel: link.keyLabel };
}

// Puts a link back after Undo.
export async function restoreLink(snapshot: LinkSnapshot) {
  const owned = await ownedSong(snapshot.songId);
  if (!owned) return;
  let url: URL;
  try {
    url = new URL(snapshot.url);
  } catch {
    return;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return;

  await prisma.attachment.create({
    data: {
      organizationId: owned.user.organizationId,
      songId: owned.song.id,
      arrangementId: owned.song.arrangements.some((a) => a.id === snapshot.arrangementId) ? snapshot.arrangementId : null,
      kind: "LINK",
      name: String(snapshot.name).slice(0, 200) || url.hostname,
      url: url.toString(),
      keyLabel: snapshot.keyLabel ? String(snapshot.keyLabel).slice(0, 8) : null,
    },
  });
  revalidatePath(`/songs/${owned.song.id}`);
}

const SONG_FILE = /\.(chordpro|cho|crd|pro|txt)$/i;
const MAX_SONG_FILES = 50;
const MAX_SONG_FILE_BYTES = 256 * 1024;

// Song files, such as ChordPro charts downloaded from SongSelect. A song already here,
// by CCLI number or title, is left alone so importing twice doesn't double it.
export async function importSongFiles(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const organizationId = user.organizationId;
  const files = formData.getAll("file").filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length === 0) return { error: "Choose at least one file." };
  if (files.length > MAX_SONG_FILES) return { error: `Choose ${MAX_SONG_FILES} files or fewer at a time.` };

  const added: string[] = [];
  const skipped: string[] = [];
  const refused: string[] = [];
  for (const file of files) {
    const song = SONG_FILE.test(file.name) && file.size <= MAX_SONG_FILE_BYTES ? parseSongFile(await file.text(), file.name) : null;
    if (!song) {
      refused.push(file.name);
      continue;
    }
    const already = await prisma.song.findFirst({
      where: { organizationId, OR: [{ title: { equals: song.title, mode: "insensitive" } }, ...(song.ccliNumber ? [{ ccliNumber: song.ccliNumber }] : [])] },
      select: { id: true },
    });
    if (already) {
      skipped.push(song.title);
      continue;
    }
    const key = song.key ?? guessKey(song.chart);
    await prisma.song.create({
      data: {
        organizationId,
        title: song.title,
        author: song.author,
        ccliNumber: song.ccliNumber,
        notes: song.copyright,
        arrangements: { create: { name: "Default", key, chartKey: key, bpm: song.bpm, meter: song.meter, chart: song.chart } },
      },
    });
    added.push(song.title);
  }

  revalidatePath("/songs");
  const parts = [
    added.length > 0 && `Added ${added.length} ${added.length === 1 ? "song" : "songs"}.`,
    skipped.length > 0 && `Already here: ${skipped.join(", ")}.`,
    refused.length > 0 && `Couldn't read: ${refused.join(", ")}.`,
  ].filter(Boolean);
  return added.length > 0 ? { ok: parts.join(" ") } : { error: parts.join(" ") };
}
