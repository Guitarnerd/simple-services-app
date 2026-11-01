import { test } from "node:test";
import assert from "node:assert/strict";
import { capoKey, classifyLine, guessKey, layoutChords, parseChart, parseChord, parseKey, renderChord, resolveTargetKey, type ChordDisplay } from "./chords";

function convert(chord: string, from: string | null, to: string | null, mode: ChordDisplay["mode"] = "chords") {
  const parsed = parseChord(chord);
  assert.ok(parsed, `${chord} should parse as a chord`);
  return renderChord(parsed, { from: parseKey(from), to: parseKey(to), mode });
}

test("recognises chords and rejects ordinary words", () => {
  for (const chord of ["G", "Am", "F#m7", "Bb", "Csus4", "Dadd9", "E7", "Gmaj7", "Bm7b5", "A/C#", "D2", "C+", "Bdim", "(G)", "G5"]) {
    assert.ok(parseChord(chord), chord);
  }
  for (const word of ["Bad", "Add", "Go", "Be", "Dad", "Cab", "Egg", "Amen", "Day", "10", "8", "I"]) {
    assert.equal(parseChord(word), null, word);
  }
});

test("transposes with the right sharps and flats for the new key", () => {
  assert.equal(convert("G", "G", "A"), "A");
  assert.equal(convert("Em7", "G", "A"), "F#m7");
  assert.equal(convert("C", "G", "F"), "Bb");
  assert.equal(convert("D/F#", "G", "Bb"), "F/A");
  assert.equal(convert("F#m", "A", "Ab"), "Fm");
  assert.equal(convert("C#m7", "E", "Eb"), "Cm7");
  assert.equal(convert("B", "E", "F"), "C");
  assert.equal(convert("Bsus4", "E", "Db"), "Absus4");
});

test("keeps borrowed chords in their role", () => {
  // bVII of G is F; bVII of E is D, of Bb is Ab.
  assert.equal(convert("F", "G", "E"), "D");
  assert.equal(convert("F", "G", "Bb"), "Ab");
  // #IV dim
  assert.equal(convert("C#dim", "G", "C"), "F#dim");
});

test("avoids double accidentals and awkward spellings", () => {
  assert.equal(convert("Bb", "G", "Gb"), "A");
  assert.equal(convert("C", "G", "Gb"), "B");
  assert.equal(convert("D#dim", "E", "F#"), "Fdim");
});

test("writes Nashville numbers", () => {
  assert.equal(convert("G", "G", null, "numbers"), "1");
  assert.equal(convert("Em7", "G", null, "numbers"), "6m7");
  assert.equal(convert("D/F#", "G", null, "numbers"), "5/7");
  assert.equal(convert("F", "G", null, "numbers"), "b7");
  assert.equal(convert("Bb", "F", null, "numbers"), "4");
  // Minor keys count from the relative major.
  assert.equal(convert("Am", "Am", null, "numbers"), "6m");
  assert.equal(convert("F", "Am", null, "numbers"), "4");
});

test("turns typed numbers into chords in any key", () => {
  assert.equal(convert("1", null, "G"), "G");
  assert.equal(convert("6m", null, "G"), "Em");
  assert.equal(convert("2-", null, "C"), "Dm");
  assert.equal(convert("5/7", null, "Bb"), "F/A");
  assert.equal(convert("b7", null, "E"), "D");
  assert.equal(convert("4maj7", null, "D"), "Gmaj7");
  assert.equal(convert("6m", null, "Em"), "Em");
  // Numbers stay numbers.
  assert.equal(convert("6m", null, null, "numbers"), "6m");
});

test("leaves letter chords as typed when the chart's key isn't known", () => {
  assert.equal(convert("F#m", null, "A"), "F#m");
});

test("tells chord lines, section headings and lyrics apart", () => {
  assert.equal(classifyLine("G      C    D").type, "chords");
  assert.equal(classifyLine("| G / / / | C / / / |").type, "chords");
  assert.equal(classifyLine("1   4   6m  5").type, "chords");
  assert.equal(classifyLine("A   D   E").type, "chords");
  assert.equal(classifyLine("Amazing grace how sweet the sound").type, "lyric");
  assert.equal(classifyLine("A mighty fortress is our God").type, "lyric");
  assert.equal(classifyLine("Am I a soldier of the cross").type, "lyric");
  for (const heading of ["VERSE 1", "Chorus", "Pre-Chorus", "Bridge x2", "[Verse 2]", "Chorus:", "Ending (x3)", "Vamp out:"]) {
    assert.equal(classifyLine(heading).type, "section", heading);
  }
  assert.deepEqual(classifyLine("[Verse 2]"), { type: "section", text: "Verse 2" });
  assert.deepEqual(classifyLine("Chorus:"), { type: "section", text: "Chorus" });
});

test("hangs chords over the lyric beneath them", () => {
  const lines = parseChart("G       C\nAmazing grace\n");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].type, "lyric");
  if (lines[0].type !== "lyric") return;
  assert.deepEqual(
    lines[0].segments.map((s) => [s.token?.text ?? null, s.text]),
    [
      ["G", "Amazing "],
      ["C", "grace"],
    ]
  );
});

test("keeps a pickup before the first chord and chords past the end of the line", () => {
  const lines = parseChart("   G        D\nA-mazing");
  assert.equal(lines[0].type, "lyric");
  if (lines[0].type !== "lyric") return;
  assert.deepEqual(
    lines[0].segments.map((s) => [s.token?.text ?? null, s.text]),
    [
      [null, "A-m"],
      ["G", "azing    "],
      ["D", ""],
    ]
  );
});

test("reads ChordPro brackets and ignores brackets that aren't chords", () => {
  const lines = parseChart("[G]Amazing [C/E]grace [softly]");
  assert.equal(lines[0].type, "lyric");
  if (lines[0].type !== "lyric") return;
  assert.deepEqual(
    lines[0].segments.map((s) => [s.token?.text ?? null, s.text]),
    [
      ["G", "Amazing "],
      ["C/E", "grace [softly]"],
    ]
  );
});

test("keeps a chord-only line (an intro) as its own line with its spacing", () => {
  const lines = parseChart("Intro\nG   D/F#  Em\n\nVerse 1\nG\nLyric");
  assert.deepEqual(
    lines.map((l) => l.type),
    ["section", "chords", "empty", "section", "lyric"]
  );
  if (lines[1].type !== "chords") return;
  assert.deepEqual(
    lines[1].tokens.map((t) => [t.col, t.text]),
    [
      [0, "G"],
      [4, "D/F#"],
      [10, "Em"],
    ]
  );
});

test("guesses a starting key, matches major/minor, and finds capo shapes", () => {
  assert.equal(guessKey("Verse\nEm   C\nlyrics"), "Em");
  assert.equal(guessKey("[D]Hello"), "D");
  assert.equal(guessKey("1  4  5"), null);
  assert.equal(resolveTargetKey("E", parseKey("Am"))?.name, "Em");
  assert.equal(resolveTargetKey("Em", parseKey("G"))?.name, "E");
  assert.equal(resolveTargetKey(null, parseKey("G"))?.name, "G");
  assert.equal(capoKey(parseKey("A")!, 2).name, "G");
  assert.equal(capoKey(parseKey("Bb")!, 3).name, "G");
  assert.equal(capoKey(parseKey("F#m")!, 2).name, "Em");
});

test("pads lyric pieces so they rejoin into the line exactly as typed", () => {
  const lyric = "    indented lyric";
  const lines = parseChart(`  G           D            Em
${lyric}`);
  assert.equal(lines[0].type, "lyric");
  if (lines[0].type !== "lyric") return;
  assert.equal(lines[0].segments.map((s) => s.text).join("").trimEnd(), lyric);
});

test("lays chords out at their columns, nudging only when one has grown", () => {
  assert.equal(layoutChords([{ col: 0, text: "G" }, { col: 8, text: "C" }]), "G       C");
  assert.equal(layoutChords([{ col: 3, text: "Em" }, { col: 12, text: "D" }]), "   Em       D");
  assert.equal(layoutChords([{ col: 0, text: "Ab" }, { col: 2, text: "Db" }, { col: 4, text: "Eb" }]), "Ab Db Eb");
});

test("leaves guitar tab lines alone", () => {
  assert.equal(classifyLine("e|---3---2---0---|").type, "lyric");
  assert.equal(classifyLine("|-----------------|").type, "lyric");
});

test("reads a bass note written on its own, and notes in parentheses, on a chord line", () => {
  // Lines from a real chart that were being read as lyrics.
  for (const line of ["     C      /E  C   G                Am", "            F         G    C (Intro)", "F    C/E   Am   Gsus    G", "G  C  (to Chorus)  D"]) {
    assert.equal(classifyLine(line).type, "chords", line);
  }
  const intro = classifyLine("F  G  C (Intro)");
  assert.deepEqual(intro.type === "chords" && intro.tokens.map((t) => [t.text, Boolean(t.chord)]), [
    ["F", true],
    ["G", true],
    ["C", true],
    ["(Intro)", false],
  ]);
  // A parenthesised remark alone is still a lyric line.
  assert.equal(classifyLine("(Repeat chorus)").type, "lyric");
});

test("transposes and numbers a bass note written on its own", () => {
  assert.equal(convert("/E", "C", "D"), "/F#");
  assert.equal(convert("/E", "C", null, "numbers"), "/3");
  assert.equal(convert("/3", null, "G"), "/B");
  assert.equal(convert("/E", null, "D"), "/E");
});

test("writes Roman numerals, lowercase for minor and diminished", () => {
  assert.equal(convert("C", "C", null, "numerals"), "I");
  assert.equal(convert("F", "C", null, "numerals"), "IV");
  assert.equal(convert("Am", "C", null, "numerals"), "vi");
  assert.equal(convert("Dm7", "C", null, "numerals"), "ii7");
  assert.equal(convert("Gsus", "C", null, "numerals"), "Vsus");
  assert.equal(convert("Cmaj7", "C", null, "numerals"), "Imaj7");
  assert.equal(convert("Bdim", "C", null, "numerals"), "vii°");
  assert.equal(convert("Bm7b5", "C", null, "numerals"), "viiø7");
  assert.equal(convert("Bb", "C", null, "numerals"), "bVII");
  assert.equal(convert("C/E", "C", null, "numerals"), "I/III");
  assert.equal(convert("/E", "C", null, "numerals"), "/III");
  // From a chart typed in numbers, and in a minor key (counted from the relative major).
  assert.equal(convert("6m", null, null, "numerals"), "vi");
  assert.equal(convert("2-7", null, null, "numerals"), "ii7");
  assert.equal(convert("Am", "Am", null, "numerals"), "vi");
});

test("bolds a section label that starts a line, whatever follows it", () => {
  // Label then chords: one chord line, with the label kept in place.
  const intro = classifyLine("INTRO: G   C/E   D (x2)");
  assert.equal(intro.type, "chords");
  if (intro.type !== "chords") return;
  assert.deepEqual(
    intro.tokens.map((t) => [t.col, t.text, Boolean(t.heading), Boolean(t.chord)]),
    [
      [0, "INTRO:", true, false],
      [7, "G", false, true],
      [11, "C/E", false, true],
      [17, "D", false, true],
      [19, "(x2)", false, false],
    ]
  );

  // Label then words: a lyric line whose label is bold.
  assert.deepEqual(classifyLine("VERSE: Sample words here"), { type: "lyric", text: "VERSE: Sample words here", label: 6 });
  assert.deepEqual(classifyLine("Chorus 2: (repeat)"), { type: "lyric", text: "Chorus 2: (repeat)", label: 9 });
  assert.deepEqual(classifyLine("  Pre-Chorus: words"), { type: "lyric", text: "  Pre-Chorus: words", label: 13 });

  // Not labels: no colon, or not a section word.
  assert.deepEqual(classifyLine("Verse one begins"), { type: "lyric", text: "Verse one begins" });
  assert.deepEqual(classifyLine("Note: play softly"), { type: "lyric", text: "Note: play softly" });
});

test("a labelled chord line transposes and keeps its label", () => {
  const lines = parseChart("INTRO: G   C   D\n\nCHORUS: [G]Sample [C]words");
  assert.equal(lines[0].type, "chords");
  assert.equal(lines[2].type, "lyric");
  if (lines[2].type !== "lyric") return;
  assert.equal(lines[2].label, 7);
  assert.equal(lines[2].segments.map((s) => s.text).join(""), "CHORUS: Sample words");
});

// Charts written in bars, as Planning Center's often are.
const chordsOn = (line: string) => {
  const parsed = classifyLine(line);
  return parsed.type === "chords" ? parsed.tokens.filter((t) => t.chord).map((t) => t.text) : null;
};

test("reads chords written in bars, tight against the bar lines", () => {
  assert.deepEqual(chordsOn("|Bm - - - | - - A - | G - - - | - - - - |"), ["Bm", "A", "G"]);
  assert.deepEqual(chordsOn("|Am - G/B - | C - - - |C - C/E - | F - - - | (2X)"), ["Am", "G/B", "C", "C", "C/E", "F"]);
  assert.deepEqual(chordsOn("Am - - - |G/B - C - |F - - - |F - - G - - |"), ["Am", "G/B", "C", "F", "F", "G"]);
  assert.deepEqual(chordsOn("                 |Am - C/E - |F - - - |"), ["Am", "C/E", "F"]);
  // Beats marked with dashes and no spaces at all.
  assert.deepEqual(chordsOn("|D-F#m-|E - - - |"), ["D", "F#m", "E"]);
  assert.deepEqual(chordsOn("|F#m- - - |D- - - |A - - - |E - - - |"), ["F#m-", "D-", "A", "E"]);
  assert.deepEqual(chordsOn("|Dm- - - |F- - - |"), ["Dm-", "F-"]);
});

test("forgives a backslash for a slash, and an m on a bass note", () => {
  assert.deepEqual(chordsOn("|G - - - | A - - - |Bm - - - |D\\F# - - - |"), ["G", "A", "Bm", "D\\F#"]);
  assert.equal(convert("D\\F#", "D", "E"), "E/G#");
  assert.deepEqual(chordsOn("|A - - - |- - - A/C#m|"), ["A", "A/C#m"]);
  assert.equal(convert("A/C#m", "A", "G"), "G/B");
});

test("words with dashes or bars in them are still words", () => {
  for (const line of ["well-known", "A-men", "Hal-le-lu-jah", "END", "e|--0--2--|", "This | that"]) {
    assert.notEqual(classifyLine(line).type, "chords", line);
  }
});

test("a section name in parentheses is a heading", () => {
  assert.deepEqual(classifyLine("(CHORUS)"), { type: "section", text: "CHORUS" });
  assert.deepEqual(classifyLine("(Chorus 2)"), { type: "section", text: "Chorus 2" });
  assert.equal(classifyLine("(softly now)").type, "lyric");
});

test("a bar line stays against its chord when the chord changes length", () => {
  const line = classifyLine("|Bm - - - |G - - - |");
  assert.equal(line.type, "chords");
  if (line.type !== "chords") return;
  const display: ChordDisplay = { from: parseKey("D"), to: parseKey("Eb"), mode: "chords" };
  const written = layoutChords(line.tokens.map((t) => ({ col: t.col, text: t.chord ? renderChord(t.chord, display) : t.text, ...(t.glued ? { glued: t.glued } : {}) })));
  assert.equal(written, "|Cm - - - |Ab - - - |");
});

test("reads an extension in parentheses, and a label before bars with no colon", () => {
  assert.deepEqual(chordsOn("| G/B / / / | C2 / / / | Em7 / / / | D(add4) / D(add4)/C /|"), ["G/B", "C2", "Em7", "D(add4)", "D(add4)/C"]);
  assert.equal(convert("D(add4)/C", "G", "A"), "E(add4)/D");
  assert.deepEqual(chordsOn("INSTRUMENTAL | Am - - - F - - - C - - - G - - - |"), ["Am", "F", "C", "G"]);
  assert.deepEqual(chordsOn("INST: | C#m - A - E - - - | 2x"), ["C#m", "A", "E"]);
  assert.deepEqual(chordsOn("| G - - -|Bm - - - |Em - - - | C - - - | ("), ["G", "Bm", "Em", "C"]);
  // A sentence that merely starts with a section word is still a sentence.
  assert.equal(classifyLine("Bridge over troubled water").type, "lyric");
  assert.equal(classifyLine("(Go)").type, "lyric");
});
