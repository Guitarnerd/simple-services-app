import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AuthCard } from "@/components/page";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };

// The first page a new site shows. Once there's a church it has nothing left to do.
export default async function SetupPage() {
  if ((await prisma.organization.count()) > 0) redirect("/login");

  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <AuthCard title="Welcome" subtitle="Set up your church and your own admin login.">
      <SetupForm zones={zones} codeSet={Boolean(process.env.SETUP_CODE)} />
    </AuthCard>
  );
}
