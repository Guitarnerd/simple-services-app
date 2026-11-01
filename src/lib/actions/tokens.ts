"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { newToken } from "@/lib/api-user";
import type { FormState } from "@/components/form";

// A token lets Claude act in the app as the person who made it, with their permissions.
// It is shown once (in `link`) and only its hash is kept.
export async function createApiToken(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || "Claude";
  if ((await prisma.apiToken.count({ where: { personId: user.id } })) >= 10) {
    return { error: "You have 10 connections already. Remove one you no longer use first." };
  }

  const { token, hash, hint } = newToken();
  await prisma.apiToken.create({ data: { personId: user.id, name, tokenHash: hash, hint } });
  revalidatePath("/account");
  return { ok: "Created.", link: token };
}

export async function revokeApiToken(formData: FormData) {
  const user = await getCurrentUser();
  await prisma.apiToken.deleteMany({ where: { id: String(formData.get("tokenId") ?? ""), personId: user.id } });
  revalidatePath("/account");
}
