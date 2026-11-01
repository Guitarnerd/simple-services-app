"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseChart, parseKey, resolveTargetKey, type ChordDisplay } from "@/lib/chords";
import { chartBlocks, wrapBlocks, type Block, type Row } from "@/lib/chart-pages";

// One line of a chart. A section label that opens the line is bold, and takes
// `labelClass` so it can stay uncoloured on a coloured chord row.
export function RowText({ row, labelClass = "" }: { row: Row; labelClass?: string }) {
  if (!row.boldPrefix) return <>{row.text || " "}</>;
  return (
    <>
      <span className={`font-bold ${labelClass}`}>{row.text.slice(0, row.boldPrefix)}</span>
      {row.text.slice(row.boldPrefix)}
    </>
  );
}

// A chart as one continuous run of fixed-width lines, for reading on a
// screen. Chords are bold black in light mode and bold blue in dark mode.
export function ChartRows({ blocks, fontSize, className = "" }: { blocks: Block[]; fontSize: number; className?: string }) {
  return (
    <div className={`chart-font overflow-x-auto whitespace-pre leading-[1.2] ${className}`} style={{ fontSize }}>
      {blocks.map((block, i) => (
        <div key={i} className="break-inside-avoid">
          {block.rows.map((row, n) => (
            <div key={n} className={row.chords ? "font-bold dark:text-blue-400" : row.bold ? "font-bold" : undefined}>
              <RowText row={row} labelClass="text-foreground" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export type ScreenMode = "chords" | "numbers" | "numerals" | "lyrics";

// The smallest the set list will shrink a chart to make it fit before it
// folds long lines instead.
const SMALLEST_FONT = 11;

// A typed chart shown in a given key, for the set list viewer. `fontSize` is
// the size asked for; on a narrow screen the chart shrinks to fit its longest
// line, and below SMALLEST_FONT folds lines instead, so it never scrolls sideways.
export function ChartScreen({
  text,
  chartKey,
  targetKey,
  mode,
  fontSize,
}: {
  text: string;
  chartKey: string | null;
  targetKey: string | null;
  mode: ScreenMode;
  fontSize: number;
}) {
  const lines = useMemo(() => parseChart(text), [text]);
  const from = parseKey(chartKey);
  const to = resolveTargetKey(targetKey, from);
  const blocks = useMemo(
    () => chartBlocks(lines, { from, to, mode: mode === "lyrics" ? "chords" : mode } as ChordDisplay, mode === "lyrics"),
    // Keys are compared by what they print as, since parseKey makes a new object each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, chartKey, targetKey, mode]
  );
  const longest = useMemo(() => Math.max(1, ...blocks.flatMap((block) => block.rows.map((row) => row.text.length))), [blocks]);

  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  // How many characters fit across at 1px of font size, once measured.
  const [perPixel, setPerPixel] = useState<number | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      // The probe is ten characters at 100px, so its width / 1000 is one character's share of the font size.
      const charWidth = (probe.current?.getBoundingClientRect().width ?? 600) / 1000;
      // A chart on a song that isn't showing has no width yet; it is measured when it appears.
      if (charWidth > 0 && element.clientWidth > 0) setPerPixel(element.clientWidth / charWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  let size = fontSize;
  let shown = blocks;
  if (perPixel !== null && longest * fontSize > perPixel) {
    size = Math.max(SMALLEST_FONT, Math.floor((perPixel / longest) * 10) / 10);
    if (longest * size > perPixel) shown = wrapBlocks(blocks, Math.floor(perPixel / size));
  }

  return (
    <div ref={box} className="relative">
      {/* Measured, never seen: kept in a box of no size so its width can't make the page scroll sideways. */}
      <span aria-hidden="true" className="invisible absolute h-0 w-0 overflow-hidden">
        <span ref={probe} className="chart-font inline-block whitespace-pre" style={{ fontSize: 100 }}>
          0000000000
        </span>
      </span>
      {/* It always fits, so it must not be a scrolling box of its own inside the page. */}
      <ChartRows blocks={shown} fontSize={size} className="!overflow-visible" />
    </div>
  );
}
