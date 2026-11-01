import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { visiblePlans } from "@/lib/schedule";
import { describePlanTime, formatClock, formatPlanDate, sortPlanTimes, toDateInput } from "@/lib/format";
import { deletePlan } from "@/lib/actions/plans";
import { Page } from "@/components/page";
import { SubmitButton } from "@/components/form";
import { PlanDetailsForm } from "@/components/plan-forms";
import { PlanEditor } from "@/components/plan-editor";
import { PlanTeam } from "@/components/plan-team";
import { PlanSections } from "@/components/plan-sections";
import { PlanTimesEditor } from "@/components/plan-times";
import { Icon } from "@/components/ui";
import { sourceFor, sourcesFor } from "@/lib/tracks";
import type { Track } from "@/components/player";

// "Demo service · Oct 18", or the kind of service when the plan has no title.
export async function generateMetadata({ params }: PageProps<"/plans/[id]">): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const plan = await prisma.plan.findFirst({ where: { id, ...visiblePlans(user) }, select: { title: true, date: true, serviceType: { select: { name: true } } } });
  if (!plan) return { title: "Plan" };
  return { title: `${plan.title ?? plan.serviceType.name} · ${plan.date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}` };
}

export default async function PlanPage({ params, searchParams }: PageProps<"/plans/[id]">) {
  const { id } = await params;
  const { position: newPosition } = await searchParams;
  const user = await getCurrentUser();
  const canEdit = hasRole(user.role, "PLANNER");

  const [plan, songs, serviceTypes] = await Promise.all([
    prisma.plan.findFirst({
      where: { id, ...visiblePlans(user) },
      include: {
        serviceType: true,
        times: true,
        items: {
          orderBy: { position: "asc" },
          include: {
            song: {
              include: {
                arrangements: {
                  orderBy: { sortOrder: "asc" },
                  select: { id: true, name: true, chart: true, key: true },
                },
                attachments: { orderBy: { createdAt: "asc" } },
              },
            },
          },
        },
      },
    }),
    canEdit
      ? prisma.song.findMany({
          where: { organizationId: user.organizationId, archived: false },
          orderBy: { title: "asc" },
          include: {
            arrangements: {
              orderBy: { sortOrder: "asc" },
              take: 1,
              select: { key: true, meter: true },
            },
          },
        })
      : [],
    canEdit
      ? prisma.serviceType.findMany({
          where: { organizationId: user.organizationId },
          orderBy: { sortOrder: "asc" },
        })
      : [],
  ]);
  if (!plan) notFound();

  const dateLabel = formatPlanDate(plan.date);
  const times = sortPlanTimes(plan.times).map((time) => ({
    id: time.id,
    text: describePlanTime(plan.date, time),
    label: time.label,
    date: time.date ? toDateInput(time.date) : null,
    time: time.time,
  }));

  // What the player can play, in plan order, and each row's place in that list.
  const tracks: Track[] = [];
  const items = plan.items.map((item) => {
    // Files and links for this arrangement, plus any that apply to every arrangement.
    const attachments = (item.song?.attachments ?? []).filter((a) => !a.arrangementId || a.arrangementId === item.arrangementId);
    const sources = sourcesFor(attachments);
    if (sources.length > 0) tracks.push({ id: item.id, title: item.title, sources });

    return {
      id: item.id,
      type: item.type,
      title: item.title,
      lengthSeconds: item.lengthSeconds,
      preService: item.preService,
      tag: item.tag,
      notes: item.notes,
      key: item.key,
      songId: item.songId,
      songHref: item.songId ? `/songs/${item.songId}?plan=${plan.id}` : null,
      arrangementId: item.arrangementId,
      defaultKey: item.song?.arrangements.find((a) => a.id === item.arrangementId)?.key ?? null,
      arrangements: (item.song?.arrangements ?? []).map(({ id, name }) => ({ id, name })),
      trackIndex: sources.length > 0 ? tracks.length - 1 : null,
      // The set list, opened at this song.
      sheetHref: item.songId ? `/plans/${plan.id}/setlist?song=${item.id}` : null,
      // Everything else attached to the song. What the player can play is
      // reached through the row's play button instead.
      links: attachments
        .filter((a) => !sourceFor(a))
        .map((a) => ({
          newTab: true,
          id: a.id,
          href: a.kind === "FILE" ? `/files/${a.id}` : (a.url ?? "#"),
          label: a.kind === "FILE" && a.keyLabel ? `${a.name} (${a.keyLabel})` : a.name,
        })),
    };
  });

  return (
    <Page
      title={plan.title ?? dateLabel}
      subtitle={[plan.title && dateLabel, plan.serviceType.name, plan.startTime && formatClock(plan.startTime)].filter(Boolean).join(" · ")}
      back={{ href: "/plans", label: "Plans" }}
      wide
      actions={
        <>
          {hasRole(user.role, "LEADER") && (
            <Link href={`/plans/multi-view?around=${plan.id}`} className="btn btn-secondary">
              Multi View
            </Link>
          )}
          <Link href={`/plans/${plan.id}/print`} className="btn btn-secondary">
            <Icon name="print" className="h-4 w-4" />
            Print
          </Link>
          <Link href={`/plans/${plan.id}/setlist`} className="btn btn-primary">
            Open set list
          </Link>
        </>
      }
    >
      {/* Rehearsal, arrival, setup: the times people need besides the service itself. */}
      {times.length > 0 && (
        <ul aria-label="Other times" className="-mt-2 flex flex-wrap gap-2 px-1">
          {times.map((time) => (
            <li key={time.id} className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-surface px-3 py-1 text-sm dark:border-white/15 dark:bg-white/[0.05]">
              <Icon name="clock" className="h-3.5 w-3.5 text-neutral-500" />
              {time.text}
            </li>
          ))}
        </ul>
      )}

      {/* Notes sit on the page itself, not in a box of their own. */}
      {plan.notes && <p className="-mt-2 max-w-3xl whitespace-pre-wrap px-1 text-sm text-neutral-700 dark:text-neutral-300">{plan.notes}</p>}

      <PlanSections
        order={
          <section className="panel">
            <h2 className="panel-head">Service plan</h2>
            <div className="px-2 py-3 sm:px-3 sm:py-4">
              <PlanEditor
                planId={plan.id}
                startTime={plan.startTime}
                canEdit={canEdit}
                songs={songs.map((s) => ({ id: s.id, title: s.title, author: s.author, key: s.arrangements[0]?.key ?? null, meter: s.arrangements[0]?.meter ?? null }))}
                items={items}
                tracks={tracks}
              />
            </div>
          </section>
        }
        team={<PlanTeam plan={plan} user={user} newPositionId={typeof newPosition === "string" ? newPosition : undefined} />}
        details={
          canEdit && (
            <section className="panel">
              <h2 className="panel-head">Plan details</h2>
              <div className="panel-body flex flex-col gap-4">
                <PlanDetailsForm
                  serviceTypes={serviceTypes}
                  plan={{
                    id: plan.id,
                    serviceTypeId: plan.serviceTypeId,
                    date: toDateInput(plan.date),
                    startTime: plan.startTime ?? "",
                    title: plan.title ?? "",
                    notes: plan.notes ?? "",
                  }}
                />
                <div className="border-t border-black/10 pt-4 dark:border-white/10">
                  <PlanTimesEditor planId={plan.id} planDate={toDateInput(plan.date)} times={times} />
                </div>
                <form action={deletePlan} className="border-t border-black/10 pt-4 dark:border-white/10">
                  <input type="hidden" name="planId" value={plan.id} />
                  <SubmitButton
                    className="btn btn-danger"
                    confirm={`Delete ${plan.title ? `\u201c${plan.title}\u201d, ` : ""}the ${plan.serviceType.name} plan for ${dateLabel}? This can't be undone.`}
                  >
                    Delete plan
                  </SubmitButton>
                </form>
              </div>
            </section>
          )
        }
      />
    </Page>
  );
}
