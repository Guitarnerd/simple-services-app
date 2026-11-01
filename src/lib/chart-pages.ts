// Lays a chord chart out on Letter pages. Because charts are fixed-width text
// with a fixed line height, where every line lands can be worked out exactly,
// so the same pages are used for the on-screen preview and for printing.
// Pure functions; safe to import from client components.

import { layoutChords, renderChord, type ChartLine, type ChordDisplay, type Token } from "@/lib/chords";

// `chords` marks a row of chords (as opposed to a bold heading), so a screen
// can colour it. `boldPrefix` is how many leading characters are a section
// label: bold on a lyric row, and not coloured on a chord row.
export type Row = { text: string; bold: boolean; chords?: true; boldPrefix?: number };

// Rows that must stay together in one column (a chord line and its lyric).
export type Block = { rows: Row[]; blank?: boolean; keepWithNext?: boolean };

function chordText(token: Token, display: ChordDisplay) {
  return token.chord ? renderChord(token.chord, display) : token.text;
}

export function chartBlocks(lines: ChartLine[], display: ChordDisplay, lyricsOnly: boolean): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    if (line.type === "empty") {
      blocks.push({ rows: [{ text: "", bold: false }], blank: true });
    } else if (line.type === "section") {
      // A heading never sits alone at the bottom of a column.
      blocks.push({ rows: [{ text: line.text, bold: true }], keepWithNext: true });
    } else if (line.type === "chords") {
      if (lyricsOnly) continue;
      const text = layoutChords(line.tokens.map((t) => ({ col: t.col, text: chordText(t, display), ...(t.glued ? { glued: t.glued } : {}) })));
      const label = line.tokens[0].heading ? line.tokens[0].col + line.tokens[0].text.length : 0;
      blocks.push({ rows: [label ? { text, bold: true, chords: true, boldPrefix: label } : { text, bold: true, chords: true }] });
    } else {
      const lyric = line.segments.map((s) => s.text).join("").trimEnd();
      const chords: { col: number; text: string; glued?: true }[] = [];
      let col = 0;
      for (const segment of line.segments) {
        if (segment.token) chords.push({ col, text: chordText(segment.token, display), ...(segment.token.glued ? { glued: segment.token.glued } : {}) });
        col += segment.text.length;
      }
      const rows: Row[] = [line.label ? { text: lyric, bold: false, boldPrefix: line.label } : { text: lyric, bold: false }];
      if (!lyricsOnly && chords.length > 0) rows.unshift({ text: layoutChords(chords), bold: true, chords: true });
      blocks.push({ rows });
    }
  }
  return blocks;
}

// Folds blocks wider than `cols` so they fit a narrow screen. Every row of a
// block breaks at the same column, preferably one where no row is mid-word,
// so chords stay over their lyrics.
export function wrapBlocks(blocks: Block[], cols: number): Block[] {
  if (cols < 8) return blocks;
  return blocks.map((block) => {
    let rows = block.rows;
    if (rows.every((row) => row.text.length <= cols)) return block;

    const out: Row[] = [];
    while (rows.some((row) => row.text.length > cols)) {
      let cut = cols;
      for (let k = cols; k > cols / 2; k--) {
        if (rows.every((row) => k >= row.text.length || row.text[k] === " " || row.text[k - 1] === " ")) {
          cut = k;
          break;
        }
      }
      for (const row of rows) {
        const text = row.text.slice(0, cut).trimEnd();
        // A chord line with nothing over this stretch of lyric isn't worth a blank line.
        if (text || rows.length === 1) out.push(row.boldPrefix ? { ...row, text, boldPrefix: Math.min(row.boldPrefix, cut) } : { ...row, text });
      }
      // What's left carries on underneath, without the section label's bold.
      rows = rows
        .map((row): Row => ({ text: row.text.slice(cut), bold: row.bold, ...(row.chords ? { chords: true } : {}) }))
        .filter((row, _, all) => row.text.trim() || all.length === 1);
    }
    return { ...block, rows: [...out, ...rows] };
  });
}

// All measurements in points (1/72 inch). US Letter.
export const PAGE = {
  width: 612,
  height: 792,
  // 0.6 inch: most printers can't reach the top quarter inch, and some feed the page a little
  // low, so a tighter top margin clipped the title band on paper (though not in a PDF).
  marginTop: 43,
  marginSide: 36,
  marginBottom: 36,
  // Grey title band on the first page, and the space under it.
  headerHeight: 44,
  headerGap: 8,
  columnGap: 24,
  // Every character of Courier New is this fraction of the font size wide.
  charWidth: 0.6,
  lineHeight: 1.2,
};

export type PageMetrics = {
  fontSize: number;
  lineHeight: number;
  columns: number;
  columnWidth: number;
  charsPerLine: number;
  linesFirstPage: number;
  linesOtherPages: number;
};

export function pageMetrics(fontSize: number, columns: number): PageMetrics {
  const lineHeight = fontSize * PAGE.lineHeight;
  const bodyHeight = PAGE.height - PAGE.marginTop - PAGE.marginBottom;
  const columnWidth = (PAGE.width - 2 * PAGE.marginSide - (columns - 1) * PAGE.columnGap) / columns;
  return {
    fontSize,
    lineHeight,
    columns,
    columnWidth,
    charsPerLine: Math.floor(columnWidth / (fontSize * PAGE.charWidth)),
    linesFirstPage: Math.floor((bodyHeight - PAGE.headerHeight - PAGE.headerGap) / lineHeight),
    linesOtherPages: Math.floor(bodyHeight / lineHeight),
  };
}

// Fills each column top to bottom, then the next column, then the next page.
// Returns pages -> columns -> rows.
export function paginate(blocks: Block[], metrics: Pick<PageMetrics, "columns" | "linesFirstPage" | "linesOtherPages">): Row[][][] {
  const pages: Row[][][] = [];
  let page: Row[][] = [];
  let column: Row[] = [];

  const capacity = () => (pages.length === 0 ? metrics.linesFirstPage : metrics.linesOtherPages);
  const nextColumn = () => {
    page.push(column);
    column = [];
    if (page.length === metrics.columns) {
      pages.push(page);
      page = [];
    }
  };

  let i = 0;
  while (i < blocks.length) {
    const group = [blocks[i]];
    while (group.at(-1)?.keepWithNext && i + group.length < blocks.length) group.push(blocks[i + group.length]);
    const rows = group.flatMap((block) => block.rows);

    // A column never starts with a blank line.
    if (blocks[i].blank && column.length === 0) {
      i++;
      continue;
    }
    if (column.length > 0 && column.length + rows.length > capacity()) {
      nextColumn();
      continue;
    }
    // Something taller than a whole column has to be split.
    for (const row of rows) {
      if (column.length >= capacity()) nextColumn();
      column.push(row);
    }
    i += group.length;
  }

  if (column.length > 0 || page.length > 0 || pages.length === 0) {
    page.push(column);
    pages.push(page);
  }
  return pages;
}
