import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChart, parseKey } from "./chords";
import { chartBlocks, pageMetrics, paginate, wrapBlocks, type Block } from "./chart-pages";

const lyric = (n: number): Block => ({ rows: [{ text: `line ${n}`, bold: false }] });
const pair = (n: number): Block => ({ rows: [{ text: "G", bold: true }, { text: `line ${n}`, bold: false }] });
const blank: Block = { rows: [{ text: "", bold: false }], blank: true };
const heading: Block = { rows: [{ text: "Chorus", bold: true }], keepWithNext: true };
const sizes = (pages: ReturnType<typeof paginate>) => pages.map((page) => page.map((column) => column.length));

test("works out what fits on a Letter page", () => {
  const one = pageMetrics(11, 1);
  assert.equal(one.charsPerLine, 81);
  assert.equal(one.linesFirstPage, 50);
  assert.equal(one.linesOtherPages, 54);
  const two = pageMetrics(11, 2);
  assert.equal(two.charsPerLine, 39);
  assert.equal(pageMetrics(9, 1).charsPerLine, 100);
});

test("turns a chart into rows, transposed, with chord lines bold", () => {
  const display = { from: parseKey("G"), to: parseKey("A"), mode: "chords" as const };
  const blocks = chartBlocks(parseChart("Verse 1\nG       C\nAmazing grace\n\ne|--0--|"), display, false);
  assert.deepEqual(
    blocks.map((b) => b.rows.map((r) => (r.bold ? `*${r.text}` : r.text))),
    [["*Verse 1"], ["*A       D", "Amazing grace"], [""], ["e|--0--|"]]
  );
  const lyricsOnly = chartBlocks(parseChart("G  C  D\nG       C\nAmazing grace"), display, true);
  assert.deepEqual(lyricsOnly.map((b) => b.rows.map((r) => r.text)), [["Amazing grace"]]);
});

test("fills a column, then the next column, then the next page", () => {
  const blocks = Array.from({ length: 12 }, (_, n) => lyric(n));
  assert.deepEqual(sizes(paginate(blocks, { columns: 1, linesFirstPage: 5, linesOtherPages: 6 })), [[5], [6], [1]]);
  assert.deepEqual(sizes(paginate(blocks, { columns: 2, linesFirstPage: 5, linesOtherPages: 6 })), [[5, 5], [2]]);
});

test("keeps a chord line with its lyric, and a heading with what follows", () => {
  // Four rows fit; the pair would straddle the break, so it moves whole.
  const pairs = paginate([lyric(1), lyric(2), lyric(3), pair(4)], { columns: 1, linesFirstPage: 4, linesOtherPages: 4 });
  assert.deepEqual(sizes(pairs), [[3], [2]]);

  const headed = paginate([lyric(1), lyric(2), lyric(3), heading, pair(4)], { columns: 1, linesFirstPage: 4, linesOtherPages: 4 });
  assert.deepEqual(sizes(headed), [[3], [3]]);
  assert.equal(headed[1][0][0].text, "Chorus");
});

test("never starts a column with a blank line", () => {
  const pages = paginate([lyric(1), lyric(2), blank, lyric(3)], { columns: 1, linesFirstPage: 2, linesOtherPages: 2 });
  assert.deepEqual(sizes(pages), [[2], [1]]);
  assert.equal(pages[1][0][0].text, "line 3");
});

test("an empty chart is one empty page, and an over-tall block is split", () => {
  assert.deepEqual(sizes(paginate([], { columns: 1, linesFirstPage: 3, linesOtherPages: 3 })), [[0]]);
  const tall: Block = { rows: Array.from({ length: 7 }, (_, n) => ({ text: `${n}`, bold: false })) };
  assert.deepEqual(sizes(paginate([tall], { columns: 1, linesFirstPage: 3, linesOtherPages: 3 })), [[3], [3], [1]]);
});


test("carries a bold label through to the printed rows", () => {
  const display = { from: parseKey("G"), to: parseKey("A"), mode: "chords" as const };
  const blocks = chartBlocks(parseChart("INTRO: G   C   D\nVERSE: Sample words\nCHORUS: [G]Sample [C]words"), display, false);
  assert.deepEqual(blocks.map((b) => b.rows), [
    [{ text: "INTRO: A   D   E", bold: true, chords: true, boldPrefix: 6 }],
    [{ text: "VERSE: Sample words", bold: false, boldPrefix: 6 }],
    [
      { text: "        A      D", bold: true, chords: true },
      { text: "CHORUS: Sample words", bold: false, boldPrefix: 7 },
    ],
  ]);
});

test("folds a wide chord and lyric pair at the same column", () => {
  const wide: Block = {
    rows: [
      { text: "G           C         D          G", bold: true, chords: true },
      { text: "Amazing grace how sweet the sound today", bold: false },
    ],
  };
  const [folded] = wrapBlocks([wide], 22);
  assert.deepEqual(
    folded.rows.map((r) => r.text),
    ["G           C", "Amazing grace how", "    D          G", "sweet the sound today"]
  );
  assert.ok(folded.rows.every((r) => r.text.length <= 22));
  // Narrow enough already: untouched.
  assert.equal(wrapBlocks([wide], 60)[0], wide);
});

test("drops an empty chord line from a folded pair, and keeps a section label bold", () => {
  const [folded] = wrapBlocks([{ rows: [{ text: "G", bold: true, chords: true }, { text: "VERSE: one two three four five six", bold: false, boldPrefix: 6 }] }], 16);
  assert.deepEqual(
    folded.rows.map((r) => [r.text, r.boldPrefix]),
    [["G", undefined], ["VERSE: one two", 6], ["three four five", undefined], ["six", undefined]]
  );
});

test("a chart written in bars keeps its bar lines against the chords, in any key", () => {
  const same = { from: parseKey("D"), to: parseKey("D"), mode: "chords" as const };
  const chart = ["(CHORUS)", "|Bm - - - |G - - - |", String.raw`|D\F# - - - |A/C#m - - - |`].join("\n");
  const rows = chartBlocks(parseChart(chart), same, false).flatMap((b) => b.rows);
  assert.deepEqual(rows.map((r) => [r.text, Boolean(r.chords)]), [["CHORUS", false], ["|Bm - - - |G - - - |", true], ["|D/F# - - - |A/C#  - - - |", true]]);
  const up = chartBlocks(parseChart("|Bm - - - |G - - - |"), { ...same, to: parseKey("Eb") }, false);
  assert.equal(up[0].rows[0].text, "|Cm - - - |Ab - - - |");
  const numbers = chartBlocks(parseChart("|Bm - - - |G - - - |"), { ...same, mode: "numbers" as const }, false);
  assert.equal(numbers[0].rows[0].text, "|6m - - - |4 - - - |");
});
