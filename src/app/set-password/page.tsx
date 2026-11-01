import type { Metadata } from "next";
import Link from "next/link";
import { findValidToken } from "@/lib/tokens";
import { AuthCard } from "@/components/page";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function SetPasswordPage({ searchParams }: PageProps<"/set-password">) {
  const { token } = await searchParams;
  const record = typeof token === "string" ? await findValidToken(token) : null;

  if (!record) {
    return (
      <AuthCard title="This link has expired" subtitle="Links can be used once and stop working after a while.">
        <Link href="/forgot-password" className="btn btn-primary w-full">
          Get a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={record.type === "INVITE" ? `Welcome, ${record.person.firstName}` : "Choose a new password"}
      subtitle={`You'll sign in with ${record.person.email}.`}
    >
      <SetPasswordForm token={token as string} />
    </AuthCard>
  );
}
