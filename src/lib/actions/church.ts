"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import type { FormState } from "@/components/form";

// Digits only, however it was typed or pasted.
export async function saveCcliLicense(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("PLANNER");
  const ccliLicense = String(formData.get("ccliLicense") ?? "").replace(/\D/g, "").slice(0, 12) || null;
  await prisma.organization.update({ where: { id: user.organizationId }, data: { ccliLicense } });
  revalidatePath("/songs/ccli");
  revalidatePath("/getting-started");
  return { ok: "Saved." };
}

// The page shrinks the picture to 512 pixels before sending it, so this is generous.
const MAX_LOGO_BYTES = 1024 * 1024;

// What the file really is, from its first bytes; what the browser says is ignored.
// Only plain pictures: never SVG, which can carry script.
function imageType(data: Buffer) {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

// Admins set the church's logo for the top of the sidebar and the phone header.
export async function setChurchLogo(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a picture first." };
  if (file.size > MAX_LOGO_BYTES) return { error: "That picture is too big. Use one under 1 MB." };

  const data = Buffer.from(await file.arrayBuffer());
  const contentType = imageType(data);
  if (!contentType) return { error: "Use a PNG, JPEG or WebP picture." };

  await prisma.$transaction([
    prisma.churchLogo.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId, data, contentType },
      update: { data, contentType },
    }),
    prisma.organization.update({ where: { id: user.organizationId }, data: { logoUpdatedAt: new Date() } }),
  ]);
  revalidatePath("/", "layout");
  return { ok: "Logo saved." };
}

export async function removeChurchLogo(): Promise<void> {
  const user = await requireRole("ADMIN");
  await prisma.$transaction([
    prisma.churchLogo.deleteMany({ where: { organizationId: user.organizationId } }),
    prisma.organization.update({ where: { id: user.organizationId }, data: { logoUpdatedAt: null } }),
  ]);
  revalidatePath("/", "layout");
}
