"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAJOR_KEYS, MINOR_KEYS, capoKey, parseChart, parseKey, resolveTargetKey, type ChordDisplay } from "@/lib/chords";
import { PAGE, chartBlocks, pageMetrics, paginate, type PageMetrics, type Row } from "@/lib/chart-pages";
import { ChartRows, RowText } from "@/components/chart-screen";

type Mode = "chords" | "numbers" | "numerals" | "lyrics";

// Text size: points on a printed page, pixels in the scrolling screen view.
const SIZES = { S: { print: 9, screen: 12 }, M: { print: 11, screen: 14 }, L: { print: 13, screen: 17 } } as const;

// The chart on Letter pages, exactly as it prints. On screen the pages are
// shrunk to fit the space; printed, each one is a full sheet. Every line is
// fixed-width text in the columns it was typed in, so chords sit over their
// syllables and guitar tab lines stay lined up.
function Pages({
  pages,
  metrics,
  title,
  author,
  sequence,
  keyLabel,
}: {
  pages: Row[][][];
  metrics: PageMetrics;
  title?: string;
  author?: string | null;
  // The order of sections in short form ("Intro V1 Ch×2 Br"), when the arrangement has one.
  sequence?: string | null;
  keyLabel: string | null;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    // 1pt is 4/3 CSS pixels.
    const fit = () => {
      if (element.clientWidth > 0) setZoom(Math.min(1, element.clientWidth / ((PAGE.width * 4) / 3)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frame} className="flex flex-col items-center gap-4 print:block">
      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          className="chart-page relative shrink-0 overflow-hidden bg-white text-black shadow-md ring-1 ring-black/10 [zoom:var(--zoom)] print:shadow-none print:ring-0 print:[zoom:1]"
          style={
            {
              "--zoom": zoom,
              width: `${PAGE.width}pt`,
              // A hair under the sheet so rounding can never spill onto a blank page.
              height: `${PAGE.height - 2}pt`,
              padding: `${PAGE.marginTop}pt ${PAGE.marginSide}pt 0`,
            } as React.CSSProperties
          }
        >
          {pageIndex === 0 && (
            <header
              className="sheet-header flex items-start justify-between gap-4 overflow-hidden bg-neutral-200 font-sans"
              style={{ height: `${PAGE.headerHeight}pt`, marginBottom: `${PAGE.headerGap}pt`, padding: "5pt 12pt" }}
            >
              <div className="min-w-0">
                <div className="truncate font-bold" style={{ fontSize: "15pt", lineHeight: "19pt" }}>
                  {title}
                </div>
                {author && (
                  <div className="truncate" style={{ fontSize: "8pt", lineHeight: "11pt" }}>
                    {author}
                  </div>
                )}
              </div>
              {/* The key, with the order of sections under it. Both fit the header's fixed height. */}
              {(keyLabel || sequence) && (
                <div className="flex min-w-0 max-w-[62%] flex-col items-end text-right">
                  <div className="font-bold" style={{ fontSize: "12pt", lineHeight: "19pt" }}>
                    {keyLabel ?? "\u00a0"}
                  </div>
                  {sequence && (
                    <div className="max-w-full truncate font-semibold" style={{ fontSize: "8pt", lineHeight: "11pt" }}>
                      {sequence}
                    </div>
                  )}
                </div>
              )}
            </header>
          )}
          <div
            className="chart-font flex whitespace-pre"
            style={{ fontSize: `${metrics.fontSize}pt`, lineHeight: `${metrics.lineHeight}pt`, gap: `${PAGE.columnGap}pt` }}
          >
            {page.map((column, columnIndex) => (
              <div key={columnIndex} className="shrink-0 overflow-hidden" style={{ width: `${metrics.columnWidth}pt` }}>
                {column.map((row, rowIndex) => (
                  <div key={rowIndex} className={row.bold ? "font-bold" : undefined} style={{ height: `${metrics.lineHeight}pt` }}>
                    <RowText row={row} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="absolute font-serif" style={{ right: `${PAGE.marginSide}pt`, bottom: "14pt", fontSize: "10pt" }}>
            {pageIndex + 1}
          </div>
        </div>
      ))}
    </div>
  );
}

function Toggle<T extends string>({
  value,
  options,
  onChange,
  label,
  names,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  label: string;
  // What to call an option when its own name isn't what should be shown.
  names?: Partial<Record<T, string>>;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-lg border border-black/15 dark:border-white/20">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={`min-h-9 cursor-pointer px-3 text-sm capitalize ${
            option === value ? "bg-indigo-600 text-white" : "bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          }`}
        >
          {names?.[option] ?? option}
        </button>
      ))}
    </div>
  );
}

// Shows a typed chart with controls for key, capo, numbers, numerals and size.
// `chartKey` is the key the chart was typed in; `initialKey` the key to open
// in. The header carries the song title, its writers and the key.
//
// Two views: "pages" (labelled Print; the default) is the printed Letter pages; "screen" is
// one continuous column at a readable size, for playing from a phone or
// tablet. Printing always uses the pages.
export function ChartViewer({
  text,
  chartKey,
  initialKey,
  title,
  author,
  sequence,
  defaultView = "pages",
}: {
  text: string;
  chartKey: string | null;
  initialKey?: string | null;
  title?: string;
  author?: string | null;
  sequence?: string | null;
  defaultView?: "pages" | "screen";
}) {
  const from = parseKey(chartKey);
  // Numerals first and by default: they read the same in every key.
  const [mode, setMode] = useState<Mode>("numerals");
  const [size, setSize] = useState<keyof typeof SIZES>("M");
  const [columns, setColumns] = useState<"1" | "2">("1");
  const [view, setView] = useState(defaultView);
  const [capo, setCapo] = useState(0);
  // null follows the chart's own key, so the preview tracks it while editing.
  const [chosenKey, setChosenKey] = useState<string | null>(initialKey ?? null);

  const lines = useMemo(() => parseChart(text), [text]);
  const target = resolveTargetKey(chosenKey, from);
  const shapes = target ? capoKey(target, capo) : null;
  const display: ChordDisplay = { from, to: shapes, mode: mode === "lyrics" ? "chords" : mode };
  const keyOptions = (target ?? from)?.minor ? MINOR_KEYS : MAJOR_KEYS;

  const keyLabel = !target ? null : mode === "chords" && capo > 0 && shapes ? `Key: ${target.name} · Capo ${capo} (${shapes.name})` : `Key: ${target.name}`;

  const blocks = chartBlocks(lines, display, mode === "lyrics");
  const metrics = pageMetrics(SIZES[size].print, Number(columns));
  const pages = paginate(blocks, metrics);
  const tooWide = blocks.flatMap((b) => b.rows).filter((row) => row.text.length > metrics.charsPerLine).length;

  return (
    <div className="flex flex-col gap-3 print:block">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Toggle label="Show" value={mode} options={["numerals", "chords", "numbers", "lyrics"] as const} onChange={setMode} />
        <label className="flex items-center gap-1.5 text-sm">
          Key
          <select value={target?.name ?? ""} onChange={(e) => setChosenKey(e.target.value)} className="input !w-auto !py-1.5">
            {!target && <option value="">—</option>}
            {target && !keyOptions.includes(target.name) && <option>{target.name}</option>}
            {keyOptions.map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </label>
        {mode === "chords" && (
          <label className="flex items-center gap-1.5 text-sm">
            Capo
            <select value={capo} onChange={(e) => setCapo(Number(e.target.value))} disabled={!target} className="input !w-auto !py-1.5">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((fret) => (
                <option key={fret} value={fret}>
                  {fret === 0 ? "None" : fret}
                </option>
              ))}
            </select>
          </label>
        )}
        <Toggle label="Text size" value={size} options={["S", "M", "L"] as const} onChange={setSize} />
        <Toggle label="Columns" value={columns} options={["1", "2"] as const} onChange={setColumns} />
        {/* "Print" is the paper pages, shown as they will print; "Screen" is for playing from a device. */}
        <Toggle label="View" value={view} options={["screen", "pages"] as const} names={{ pages: "Print" }} onChange={setView} />
        <button type="button" onClick={() => window.print()} className="btn btn-secondary !min-h-9 !py-1">
          Send to printer
        </button>
      </div>

      {!from && lines.length > 0 && (
        <p className="muted text-sm print:hidden">Set the key this chart is written in to transpose it or show numbers.</p>
      )}

      {lines.length === 0 ? (
        <p className="muted text-sm print:hidden">Nothing typed yet.</p>
      ) : (
        <>
          <p className={`text-sm print:hidden ${view === "pages" ? "" : "hidden"}`}>
            <span className="font-medium">
              Prints on {pages.length} {pages.length === 1 ? "page" : "pages"}
            </span>
            <span className="muted">
              {" "}
              · Letter, {metrics.fontSize} pt, {columns === "1" ? "one column" : "two columns"}
            </span>
            {tooWide > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {" "}
                · {tooWide} {tooWide === 1 ? "line is" : "lines are"} wider than {metrics.charsPerLine} characters and will be cut off. Use a
                smaller size{columns === "2" && " or one column"}.
              </span>
            )}
          </p>
          {/* Scrolling view for playing from a device. Never printed. */}
          {view === "screen" && (
            <div className="flex flex-col gap-3 print:hidden">
              <header className="flex items-start justify-between gap-4 bg-neutral-200 px-4 py-2 text-black dark:bg-neutral-800 dark:text-white">
                <div className="min-w-0">
                  <div className="text-xl font-bold leading-tight">{title}</div>
                  {author && <div className="text-xs">{author}</div>}
                </div>
                <div className="flex min-w-0 max-w-[62%] flex-col items-end text-right">
                  {keyLabel && <div className="font-bold">{keyLabel}</div>}
                  {sequence && <div className="text-xs font-semibold">{sequence}</div>}
                </div>
              </header>
              <ChartRows blocks={blocks} fontSize={SIZES[size].screen} className={columns === "2" ? "gap-8 md:columns-2" : ""} />
            </div>
          )}

          {/* The printed pages: always what the printer gets, whichever view is showing. */}
          <div className={view === "pages" ? "rounded-lg bg-neutral-300 p-3 dark:bg-neutral-700 print:bg-transparent print:p-0" : "hidden print:block"}>
            <Pages pages={pages} metrics={metrics} title={title} author={author} sequence={sequence} keyLabel={keyLabel} />
          </div>
        </>
      )}
    </div>
  );
}

// A chart's printed pages with no controls, as they go into a whole service's
// printout: numerals, in the key the service plays it in, medium text, one column.
export function PrintedChart({
  text,
  chartKey,
  playKey,
  title,
  author,
  sequence,
}: {
  text: string;
  chartKey: string | null;
  playKey: string | null;
  title: string;
  author: string | null;
  sequence: string | null;
}) {
  const from = parseKey(chartKey);
  const target = resolveTargetKey(playKey, from);
  const metrics = pageMetrics(SIZES.M.print, 1);
  const pages = paginate(chartBlocks(parseChart(text), { from, to: target, mode: "numerals" }, false), metrics);
  return <Pages pages={pages} metrics={metrics} title={title} author={author} sequence={sequence} keyLabel={target ? `Key: ${target.name}` : null} />;
}
