import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthCard } from "@/components/page";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  // Somewhere on this site only.
  const back = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : undefined;
  if (await getOptionalUser()) redirect(back ?? "/");
  // A new site, with nobody to sign in yet.
  if ((await prisma.organization.count()) === 0) redirect("/setup");

  return (
    <AuthCard title="Sign in" subtitle="Use the email your invite went to.">
      <LoginForm next={back} />
    </AuthCard>
  );
}
