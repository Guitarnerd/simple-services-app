import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { youtubeId } from "@/lib/format";
import { Page } from "@/components/page";
import { Icon } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { findLyric, plainWords } from "@/lib/lyrics";

export const metadata: Metadata = { title: "Songs" };

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function SongsPage({ searchParams }: PageProps<"/songs">) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const q = first(params.q).trim();
  const isPlanner = hasRole(user.role, "PLANNER");
  const showArchived = isPlanner && first(params.archived) === "1";

  const found = await prisma.song.findMany({
    where: {
      organizationId: user.organizationId,
      archived: showArchived,
    },
    include: {
      arrangements: { orderBy: { sortOrder: "asc" }, select: { id: true, key: true, meter: true, chart: true } },
      attachments: { select: { kind: true, contentType: true, url: true } },
    },
  });
  // Sorted here so capitals don't come before small letters ("asdf" before "It Is Well").
  const sorted = found.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }));

  // A search looks at titles and authors, then at the words of the songs themselves, so a
  // line someone is singing finds its song. `lyric` is the line that matched, to show why.
  const wanted = plainWords(q);
  const songs = sorted
    .map((song) => {
      const named = !wanted || plainWords(`${song.title} ${song.author ?? ""}`).includes(wanted);
      const lyric = named ? null : (song.arrangements.map((a) => findLyric(a.chart, q)).find(Boolean) ?? null);
      return { ...song, named, lyric };
    })
    .filter((song) => song.named || song.lyric)
    // Songs found by name come before songs found by a lyric.
    .sort((a, b) => Number(b.named) - Number(a.named));

  return (
    <Page
      title="Songs"
      subtitle={`${songs.length} ${showArchived ? "archived " : ""}${songs.length === 1 ? "song" : "songs"}`}
      actions={
        isPlanner && (
          <>
            <Link href="/songs/ccli" className="btn btn-secondary">
              CCLI report
            </Link>
            <Link href="/songs/import" className="btn btn-secondary">
              Import songs
            </Link>
            <Link href="/songs/new" className="btn btn-primary">
              Add song
            </Link>
          </>
        )
      }
    >
      <FilterBar className="flex items-center gap-3">
        <input name="q" type="search" defaultValue={q} placeholder="Search title, author or lyrics" aria-label="Search songs" className="input flex-1" />
        {isPlanner && (
          <label className="flex shrink-0 items-center gap-2 px-1 text-sm">
            <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} aria-label="Show archived" />
            Archived
          </label>
        )}
      </FilterBar>

      {songs.length === 0 ? (
        <p className="empty">{q ? "No songs match that search." : "No songs yet."}</p>
      ) : (
        <ul className="list">
          {songs.map((song) => {
            const keys = [...new Set(song.arrangements.map((a) => a.key).filter(Boolean))];
            const meters = [...new Set(song.arrangements.map((a) => a.meter).filter(Boolean))];
            // A song opens on its song sheet, looking as it does in a set list, when it has one;
            // on its details when it doesn't.
            const sheet = song.arrangements.find((a) => a.chart);
            const hasChart = song.arrangements.some((a) => a.chart) || song.attachments.some((a) => a.contentType === "application/pdf" || a.contentType?.startsWith("image/"));
            const hasMusic = song.attachments.some((a) => a.contentType?.startsWith("audio/") || (a.url && youtubeId(a.url)));
            return (
              <li key={song.id}>
                <Link href={sheet ? `/songs/${song.id}/sheet` : `/songs/${song.id}`} aria-label={[song.title, ...keys.map((key) => `key of ${key}`), ...meters.map((meter) => `in ${meter}`)].join(", ")} className="list-row">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                    <Icon name="songs" className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{song.title}</div>
                    <div className="muted truncate text-xs">{song.author || "No authors listed"}</div>
                    {song.lyric && <div className="truncate text-xs italic text-neutral-700 dark:text-neutral-300">&ldquo;{song.lyric}&rdquo;</div>}
                  </div>
                  <div className="hidden shrink-0 items-center gap-3 sm:flex">
                    {hasChart && <span className="muted font-mono text-xs uppercase tracking-wider">Chart</span>}
                    {hasMusic && <span className="muted font-mono text-xs uppercase tracking-wider">Music</span>}
                  </div>
                  {keys.map((key) => (
                    <span key={key} className="badge-key">
                      {key}
                    </span>
                  ))}
                  {meters.map((meter) => (
                    <span key={meter} className="badge hidden font-mono tabular-nums sm:inline-flex" title="Time signature">
                      {meter}
                    </span>
                  ))}
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
