import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { planBackLink } from "@/lib/schedule";
import { formatLength, formatPlanDate } from "@/lib/format";
import { deleteArrangement, setSongArchived } from "@/lib/actions/songs";
import { Page } from "@/components/page";
import { SubmitButton } from "@/components/form";
import { Icon } from "@/components/ui";
import { AttachmentList } from "@/components/attachment-list";
import { ArrangementEditor, ArrangementForm, LinkForm, SongForm, UploadForm } from "@/components/song-forms";

export async function generateMetadata({ params }: PageProps<"/songs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const song = await prisma.song.findFirst({ where: { id, organizationId: user.organizationId }, select: { title: true } });
  return { title: song?.title ?? "Song" };
}

export default async function SongPage({ params, searchParams }: PageProps<"/songs/[id]">) {
  const { id } = await params;
  const { plan: fromPlan } = await searchParams;
  const user = await getCurrentUser();

  const song = await prisma.song.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      arrangements: { orderBy: { sortOrder: "asc" } },
      attachments: { orderBy: { createdAt: "asc" }, include: { arrangement: { select: { name: true } } } },
      planItems: {
        orderBy: { plan: { date: "desc" } },
        take: 8,
        include: { plan: { include: { serviceType: true } } },
      },
    },
  });
  if (!song) notFound();
  const planLink = await planBackLink(user, fromPlan);

  const canEdit = hasRole(user.role, "PLANNER");
  const arrangementOptions = song.arrangements.map((a) => ({ id: a.id, name: a.name }));

  return (
    <Page
      title={song.title}
      subtitle={[song.author, song.archived && "Archived"].filter(Boolean).join(" · ") || undefined}
      back={planLink ?? { href: "/songs", label: "Songs" }}
      actions={
        planLink && (
          <Link href={planLink.href} className="btn btn-primary">
            Back to plan
          </Link>
        )
      }
    >
      {/* What a musician opens the song for: the facts and the chart, before any form. */}
      <section className="card flex flex-col gap-4">
        {song.notes && <p className="whitespace-pre-wrap text-sm">{song.notes}</p>}
        {song.arrangements.map((arrangement, n) => {
          const facts = [arrangement.meter, arrangement.bpm && `${arrangement.bpm} BPM`, arrangement.lengthSeconds != null && formatLength(arrangement.lengthSeconds)].filter(Boolean);
          return (
            <div key={arrangement.id} className={`flex flex-col gap-3 ${n > 0 ? "border-t border-black/10 pt-4 dark:border-white/10" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                {song.arrangements.length > 1 && <span className="mr-1 font-semibold">{arrangement.name}</span>}
                {arrangement.key && <span className="badge-key !px-2 !py-1 !text-sm">Key of {arrangement.key}</span>}
                {facts.map((fact) => (
                  <span key={String(fact)} className="badge !px-2 !py-1 !text-sm">
                    {fact}
                  </span>
                ))}
                {!arrangement.key && facts.length === 0 && <span className="muted text-sm">No key, tempo or length set yet.</span>}
              </div>
              {arrangement.sequence && (
                <ol aria-label="Sequence" className="flex flex-wrap gap-1.5">
                  {arrangement.sequence.split(",").map((part, n) => (
                    <li key={n} className="rounded-md border border-black/10 px-2 py-0.5 text-xs font-medium dark:border-white/15">
                      {part.trim()}
                    </li>
                  ))}
                </ol>
              )}
              {arrangement.notes && <p className="muted whitespace-pre-wrap text-sm">{arrangement.notes}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {arrangement.chart ? (
                  <Link href={`/songs/${song.id}/chart/${arrangement.id}`} className="btn btn-primary">
                    <Icon name="sheet" className="h-[18px] w-[18px]" />
                    Open chord chart
                  </Link>
                ) : (
                  !canEdit && <span className="muted text-sm">No chord chart typed yet.</span>
                )}
                {canEdit && (
                  <Link href={`/songs/${song.id}/chart/${arrangement.id}/edit`} className="btn btn-secondary">
                    {arrangement.chart ? "Edit chord chart" : "Type a chord chart"}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* The forms stay shut until asked for. They save themselves, and the summary above follows. */}
      {canEdit && (
        <details className="card group/edit">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <h2 className="font-semibold">Song details</h2>
            <span className="btn btn-secondary !min-h-8 !px-3 !py-1 text-xs group-open/edit:hidden">Edit</span>
            <span className="btn btn-secondary !min-h-8 !px-3 !py-1 hidden text-xs group-open/edit:inline-flex">Done</span>
          </summary>
          <div className="mt-4">
            <SongForm
              songId={song.id}
              song={{
                title: song.title,
                author: song.author ?? "",
                ccliNumber: song.ccliNumber ?? "",
                notes: song.notes ?? "",
              }}
            />
          </div>
        </details>
      )}

      {canEdit &&
        song.arrangements.map((arrangement) => (
          <details key={arrangement.id} className="card group/edit">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <h2 className="font-semibold">{song.arrangements.length === 1 ? "Arrangement" : `Arrangement: ${arrangement.name}`}</h2>
              <span className="btn btn-secondary !min-h-8 !px-3 !py-1 text-xs group-open/edit:hidden">Edit</span>
              <span className="btn btn-secondary !min-h-8 !px-3 !py-1 hidden text-xs group-open/edit:inline-flex">Done</span>
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              <ArrangementEditor
                songId={song.id}
                arrangement={{
                  id: arrangement.id,
                  name: arrangement.name,
                  key: arrangement.key ?? "",
                  bpm: arrangement.bpm?.toString() ?? "",
                  meter: arrangement.meter ?? "",
                  length: formatLength(arrangement.lengthSeconds),
                  sequence: arrangement.sequence ?? "",
                  notes: arrangement.notes ?? "",
                }}
              />
              {song.arrangements.length > 1 && (
                <form action={deleteArrangement}>
                  <input type="hidden" name="songId" value={song.id} />
                  <input type="hidden" name="arrangementId" value={arrangement.id} />
                  <SubmitButton className="btn btn-danger" confirm={`Delete the ${arrangement.name} arrangement? Its files and links stay on the song.`}>
                    Delete arrangement
                  </SubmitButton>
                </form>
              )}
            </div>
          </details>
        ))}

      {canEdit && (
        <details className="px-1">
          <summary className="link cursor-pointer text-sm">+ Add another arrangement</summary>
          <div className="card mt-3">
            <ArrangementForm songId={song.id} />
          </div>
        </details>
      )}

      <section className="card">
        <h2 className="mb-3 font-semibold">Files and links</h2>
        <AttachmentList
          canEdit={canEdit}
          songTitle={song.title}
          attachments={song.attachments.map((a) => ({
            id: a.id,
            kind: a.kind,
            name: a.name,
            url: a.url,
            contentType: a.contentType,
            size: a.size,
            keyLabel: a.keyLabel,
            arrangementName: song.arrangements.length > 1 ? a.arrangement?.name : null,
          }))}
        />
        {canEdit && (
          <div className="mt-4 grid grid-cols-1 gap-6 border-t border-black/10 pt-4 md:grid-cols-2 dark:border-white/10">
            <LinkForm songId={song.id} arrangements={arrangementOptions} />
            <UploadForm songId={song.id} arrangements={arrangementOptions} />
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Recent use</h2>
        {song.planItems.length === 0 ? (
          <p className="muted text-sm">Not in any plans yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {song.planItems.map((item) => (
              <li key={item.id}>
                <Link href={`/plans/${item.planId}`} className="link">
                  {formatPlanDate(item.plan.date, "short")}
                </Link>
                <span className="muted">
                  {" "}
                  · {item.plan.serviceType.name}
                  {item.key && ` · Key of ${item.key}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <form action={setSongArchived}>
          <input type="hidden" name="songId" value={song.id} />
          <input type="hidden" name="archived" value={song.archived ? "false" : "true"} />
          {song.archived ? (
            <SubmitButton className="btn btn-secondary">Restore song</SubmitButton>
          ) : (
            <SubmitButton
              className="btn btn-danger"
              confirm={`Archive ${song.title}? It will be hidden from the song list but stay in past plans. You can restore it later.`}
            >
              Archive song
            </SubmitButton>
          )}
        </form>
      )}
    </Page>
  );
}
