import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { formatPlanDate, toDateInput, todayInZone } from "@/lib/format";
import { ccliUsage, readDay } from "@/lib/ccli";
import { Page } from "@/components/page";
import { CcliLicenseForm } from "@/components/ccli-license-form";

export const metadata: Metadata = { title: "CCLI report" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Which songs were used in services over a stretch of time, with their CCLI
// numbers, ready to enter on CCLI's reporting site.
export default async function CcliReportPage({ searchParams }: PageProps<"/songs/ccli">) {
  const user = await requireRole("PLANNER");
  const params = await searchParams;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
  const today = todayInZone(org.timezone);

  // Unless told otherwise: the six months up to today.
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
  const from = readDay(first(params.from)) ?? sixMonthsAgo;
  const to = readDay(first(params.to)) ?? today;

  const rows = await ccliUsage(user.organizationId, from, to);
  const reportable = rows.filter((row) => row.ccliNumber);
  const missing = rows.filter((row) => !row.ccliNumber);
  const range = `from=${toDateInput(from)}&to=${toDateInput(to)}`;

  return (
    <Page
      title="CCLI report"
      subtitle={`Songs used in services, ${formatPlanDate(from, "short")} to ${formatPlanDate(to, "short")}`}
      back={{ href: "/songs", label: "Songs" }}
      actions={
        reportable.length > 0 && (
          // A plain link, not a page link, so the browser downloads the file.
          <a href={`/songs/ccli/export?${range}`} className="btn btn-primary">
            Download spreadsheet
          </a>
        )
      }
    >
      <form className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="ccli-from">
            From
          </label>
          <input id="ccli-from" name="from" type="date" defaultValue={toDateInput(from)} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="ccli-to">
            To
          </label>
          <input id="ccli-to" name="to" type="date" defaultValue={toDateInput(to)} required className="input" />
        </div>
        <button type="submit" className="btn btn-secondary">
          Show
        </button>
      </form>

      <CcliLicenseForm ccliLicense={org.ccliLicense ?? ""} />

      <p className="muted max-w-3xl text-sm">
        CCLI only accepts automatic reports from its partner companies, so this can&apos;t send the report for you. It does the counting: sign in at{" "}
        <a href="https://reporting.ccli.com" target="_blank" rel="noopener noreferrer" className="link">
          reporting.ccli.com
        </a>
        , search each song by its number, and enter its count under every way you used it (Digital for words on a screen, Print for paper or charts, and so on). A song
        counts once per service it was in.
      </p>

      {rows.length === 0 ? (
        <p className="empty">No songs from the library were used in a service between those dates.</p>
      ) : (
        <>
          {reportable.length > 0 && (
            <section className="panel">
              <h2 className="panel-head">
                To report: {reportable.length} {reportable.length === 1 ? "song" : "songs"}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="muted border-b border-black/10 text-xs uppercase tracking-wide dark:border-white/10">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 font-semibold">
                        CCLI #
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        Song
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                        Times used
                      </th>
                      <th scope="col" className="hidden px-5 py-2.5 font-semibold md:table-cell">
                        Last used
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
                    {reportable.map((row) => (
                      <tr key={row.songId}>
                        {/* Selects whole on a click, for pasting into CCLI's search. */}
                        <td className="select-all whitespace-nowrap px-5 py-2.5 font-mono tabular-nums">{row.ccliNumber}</td>
                        <td className="px-3 py-2.5">
                          <Link href={`/songs/${row.songId}`} className="font-medium hover:underline">
                            {row.title}
                          </Link>
                          {row.author && <div className="muted text-xs">{row.author}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-base font-semibold tabular-nums">{row.uses}</td>
                        <td className="muted hidden whitespace-nowrap px-5 py-2.5 md:table-cell">{formatPlanDate(new Date(`${row.dates.at(-1)}T00:00:00Z`), "short")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {missing.length > 0 && (
            <section className="card">
              <h2 className="font-semibold">
                No CCLI number: {missing.length} {missing.length === 1 ? "song" : "songs"}
              </h2>
              <p className="muted mb-3 mt-1 text-sm">
                These were used but have no CCLI number, so they aren&apos;t in the report. That&apos;s right for public-domain hymns and your own songs. If one should be
                reported, add its number on the song&apos;s page.
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {missing.map((row) => (
                  <li key={row.songId}>
                    <Link href={`/songs/${row.songId}`} className="link">
                      {row.title}
                    </Link>
                    <span className="muted">
                      {" "}
                      · used {row.uses} {row.uses === 1 ? "time" : "times"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
