import "server-only";
import { randomBytes } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { del, get, put } from "@vercel/blob";

// Uploaded files are private: they are only ever read back through the
// signed-in /files/[id] route, never from a public URL.
//
// With BLOB_READ_WRITE_TOKEN set they go to Vercel Blob (private access);
// otherwise to ./uploads on this machine, for local development.

const LOCAL_ROOT = path.join(process.cwd(), "uploads");

// Extension -> content type. Anything not listed is refused at upload, and the
// type is always taken from here, never from what the browser claims.
export const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  txt: "text/plain; charset=utf-8",
  pro: "text/plain; charset=utf-8",
  cho: "text/plain; charset=utf-8",
  chordpro: "text/plain; charset=utf-8",
  crd: "text/plain; charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function contentTypeFor(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_TYPES[extension] ?? null;
}

function usingBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function localPath(key: string) {
  const resolved = path.join(LOCAL_ROOT, key);
  if (!resolved.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Bad storage key");
  return resolved;
}

export async function saveFile(organizationId: string, fileName: string, data: Buffer, contentType: string) {
  const safeName = fileName.replace(/[^\w.-]+/g, "_").slice(-80);
  const key = `${organizationId}/${randomBytes(12).toString("hex")}/${safeName}`;

  if (usingBlob()) {
    await put(key, data, { access: "private", contentType, addRandomSuffix: false });
  } else {
    await mkdir(path.dirname(localPath(key)), { recursive: true });
    await writeFile(localPath(key), data);
  }
  return key;
}

export async function openFile(key: string): Promise<ReadableStream<Uint8Array> | Buffer | null> {
  if (usingBlob()) {
    const result = await get(key, { access: "private" });
    return result && result.statusCode === 200 ? result.stream : null;
  }
  try {
    return await readFile(localPath(key));
  } catch {
    return null;
  }
}

export async function deleteFile(key: string) {
  if (usingBlob()) {
    await del(key);
    return;
  }
  await unlink(localPath(key)).catch(() => {});
}
