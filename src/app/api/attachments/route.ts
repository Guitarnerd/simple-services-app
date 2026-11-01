import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getOptionalUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { contentTypeFor, MAX_UPLOAD_BYTES, saveFile } from "@/lib/storage";

function fail(error: string, status = 400) {
  return Response.json({ error }, { status });
}

// Uploads one or more files to a song. A route handler rather than a Server
// Action so the request isn't held to the Server Action body size limit.
export async function POST(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);
  if (!hasRole(user.role, "PLANNER")) return fail("You don't have permission to upload files.", 403);

  const form = await request.formData();
  const songId = String(form.get("songId") ?? "");
  const arrangementId = String(form.get("arrangementId") ?? "") || null;
  const keyLabel = String(form.get("keyLabel") ?? "").trim() || null;
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);

  const song = await prisma.song.findFirst({
    where: { id: songId, organizationId: user.organizationId },
    include: { arrangements: { select: { id: true } } },
  });
  if (!song) return fail("That song no longer exists.", 404);
  if (arrangementId && !song.arrangements.some((a) => a.id === arrangementId)) {
    return fail("That arrangement no longer exists.");
  }
  if (files.length === 0) return fail("Choose a file to upload.");

  for (const file of files) {
    if (!contentTypeFor(file.name)) {
      return fail(`${file.name} isn't a supported type. Use PDF, image, audio, text or Word files.`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return fail(`${file.name} is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
    }
  }

  for (const file of files) {
    const contentType = contentTypeFor(file.name) as string;
    const storageKey = await saveFile(user.organizationId, file.name, Buffer.from(await file.arrayBuffer()), contentType);
    await prisma.attachment.create({
      data: {
        organizationId: user.organizationId,
        songId,
        arrangementId,
        kind: "FILE",
        name: file.name,
        storageKey,
        contentType,
        size: file.size,
        keyLabel,
      },
    });
  }

  revalidatePath(`/songs/${songId}`);
  return Response.json({ ok: true, count: files.length });
}
