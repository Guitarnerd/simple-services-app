import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { describeService, verifyResponseLink } from "@/lib/schedule";
import { AuthCard } from "@/components/page";
import { RespondForm } from "@/components/schedule-forms";

export const metadata: Metadata = { title: "Can you serve?" };

// Opened from the buttons in a schedule email. No sign-in: the signed link is
// the permission, and it only allows answering this one request.
export default async function RespondPage({ params, searchParams }: PageProps<"/respond/[id]">) {
  const { id } = await params;
  const { t, answer } = await searchParams;
  const token = typeof t === "string" ? t : "";

  const assignment = verifyResponseLink(id, token)
    ? await prisma.assignment.findUnique({
        where: { id },
        include: { person: true, plan: { include: { serviceType: true, organization: true } } },
      })
    : null;

  if (!assignment) {
    return (
      <AuthCard title="This request isn't available" subtitle="The link may be incomplete, or the request may have been withdrawn.">
        <p className="muted text-sm">If you think this is a mistake, reply to whoever scheduled you.</p>
      </AuthCard>
    );
  }

  const positions = await prisma.assignment.findMany({
    where: { planId: assignment.planId, personId: assignment.personId },
    include: { position: { include: { team: true } } },
    orderBy: [{ position: { team: { sortOrder: "asc" } } }, { position: { sortOrder: "asc" } }],
  });

  return (
    <AuthCard
      title={`Hi ${assignment.person.firstName}, can you serve?`}
      subtitle={`${assignment.plan.organization.name} · ${describeService(assignment.plan)}`}
    >
      <ul className="mb-5 flex flex-wrap gap-2">
        {positions.map(({ position }) => (
          <li key={position.id} className="badge">
            {position.team.name} · {position.name}
          </li>
        ))}
      </ul>
      <RespondForm assignmentId={id} token={token} suggested={answer === "decline" ? "decline" : "confirm"} current={assignment.status} />
    </AuthCard>
  );
}
