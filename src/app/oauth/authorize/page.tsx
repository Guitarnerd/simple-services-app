import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { ROLE_LABELS } from "@/lib/roles";
import { AuthCard } from "@/components/page";
import { SubmitButton } from "@/components/form";
import { approveConnection, denyConnection } from "@/lib/actions/oauth";

export const metadata: Metadata = { title: "Connect Claude" };

// Where claude.ai or the Claude app sends someone to approve a connection. The
// sign-in check (proxy) has already brought them back here after signing in.
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const params = await searchParams;
  const get = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const user = await getCurrentUser();

  const client = get("client_id") ? await prisma.oAuthClient.findUnique({ where: { id: get("client_id") } }) : null;
  const redirectUri = get("redirect_uri");
  const problem = !client
    ? "This connection request isn't from a registered app. Start again from Claude."
    : !client.redirectUris.includes(redirectUri)
      ? "This connection request has an address that doesn't match the app. Start again from Claude."
      : get("response_type") !== "code" || get("code_challenge_method") !== "S256" || !get("code_challenge")
        ? "This connection request is missing what it needs. Start again from Claude."
        : null;

  if (problem) {
    return (
      <AuthCard title="Can't connect" subtitle={problem}>
        <p className="muted text-sm">Nothing was shared.</p>
      </AuthCard>
    );
  }

  const fields = { clientId: get("client_id"), redirectUri, state: get("state"), codeChallenge: get("code_challenge") };
  const hidden = Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);

  return (
    <AuthCard title={`Connect ${client!.name}?`} subtitle="Let Claude work in Simple Services for you.">
      <div className="flex flex-col gap-4 text-sm">
        <p>
          Claude will be able to do what you can do here, as <span className="font-semibold">{`${user.firstName} ${user.lastName}`}</span> ({ROLE_LABELS[user.role]}): look up
          songs, plans and people, add songs and charts, build plans and schedule people. It asks you before emailing anyone.
        </p>
        <p className="muted">You can remove the connection at any time under Account → Claude connection.</p>
        <div className="flex gap-2">
          <form action={approveConnection} className="flex-1">
            {hidden}
            <SubmitButton className="btn btn-primary w-full" pendingLabel="Connecting…">
              Allow
            </SubmitButton>
          </form>
          <form action={denyConnection} className="flex-1">
            {hidden}
            <SubmitButton className="btn btn-secondary w-full">Cancel</SubmitButton>
          </form>
        </div>
      </div>
    </AuthCard>
  );
}
