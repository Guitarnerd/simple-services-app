// Chord chart parsing, transposing and Nashville numbers.
// Pure functions with no dependencies; safe to import from client components.
//
// A chart is plain text. Three ways of writing chords are understood and can
// be mixed:
//
//   chords over lyrics        G        C          a line made only of chords,
//                             Amazing grace       sitting above its lyric line
//   ChordPro brackets         [G]Amazing [C]grace
//   Nashville numbers         1  4  6m  5/7  b7   in place of letter chords
//
// Every chord is reduced to its function in the key (scale degree plus an
// alteration), so it can be written back out in any key or as a number.

const LETTERS = "CDEFGAB";
// Semitones above C of each natural note, which is also the major scale.
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// Correct but awkward spellings that players would rather not read.
const SIMPLER: Record<string, string> = { Cb: "B", Fb: "E", "E#": "F", "B#": "C" };

export const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

type Note = { letter: number; semitone: number };
type Fn = { degree: number; alt: number };

export type Key = { name: string; tonic: Note; minor: boolean };

function parseNote(text: string): Note | null {
  const match = /^([A-G])([#b]{0,2})$/.exec(text);
  if (!match) return null;
  const letter = LETTERS.indexOf(match[1]);
  const accidental = [...match[2]].reduce((sum, c) => sum + (c === "#" ? 1 : -1), 0);
  return { letter, semitone: mod(NATURAL[letter] + accidental, 12) };
}

function noteName(letter: number, semitone: number) {
  const accidental = mod(semitone - NATURAL[letter] + 6, 12) - 6;
  // A double sharp or flat is respelled as the plain note it sounds like.
  if (Math.abs(accidental) > 1) return (accidental < 0 ? FLAT_NAMES : SHARP_NAMES)[semitone];
  const name = LETTERS[letter] + (accidental === 1 ? "#" : accidental === -1 ? "b" : "");
  return SIMPLER[name] ?? name;
}

export function parseKey(text: string | null | undefined): Key | null {
  const match = /^([A-G][#b]?)(m?)$/.exec((text ?? "").trim().replace(/♯/g, "#").replace(/♭/g, "b"));
  const tonic = match && parseNote(match[1]);
  if (!match || !tonic) return null;
  return { name: match[1] + match[2], tonic, minor: match[2] === "m" };
}

// Numbers are always counted from the major key, so A minor counts from C.
function majorTonic(key: Key): Note {
  if (!key.minor) return key.tonic;
  return { letter: (key.tonic.letter + 2) % 7, semitone: (key.tonic.semitone + 3) % 12 };
}

function noteToFn(note: Note, key: Key): Fn {
  const tonic = majorTonic(key);
  const degree = mod(note.letter - tonic.letter, 7);
  return { degree, alt: mod(note.semitone - (tonic.semitone + NATURAL[degree]) + 6, 12) - 6 };
}

function fnToNoteName(fn: Fn, key: Key) {
  const tonic = majorTonic(key);
  return noteName((tonic.letter + fn.degree) % 7, mod(tonic.semitone + NATURAL[fn.degree] + fn.alt, 12));
}

function fnToNumber(fn: Fn) {
  return (fn.alt < 0 ? "b".repeat(-fn.alt) : "#".repeat(fn.alt)) + (fn.degree + 1);
}

function numberToFn(text: string): Fn | null {
  const match = /^([#b]?)([1-7])$/.exec(text);
  if (!match) return null;
  return { degree: Number(match[2]) - 1, alt: match[1] === "#" ? 1 : match[1] === "b" ? -1 : 0 };
}

// ----- Chords -----

export type Chord = {
  kind: "letter" | "number";
  root: string;
  quality: string;
  bass: string | null;
  // Parentheses around the chord, kept as typed.
  prefix: string;
  suffix: string;
};

// What may follow the root: m, maj7, sus4, add9, 7b5, dim, +, and so on.
// Kept strict so ordinary words ("Bad", "Add", "Go") are never read as chords.
const QUALITY =
  "(?:maj|min|dim|aug|sus|add|m|M|\\+|-|°|ø)?(?:2|4|5|6|7|9|11|13)?(?:(?:maj|min|dim|aug|sus|add|no|omit|alt|M|b|#|\\+|-)\\d{0,2})*" +
  // An extension in parentheses: "D(add4)", "G(no3)".
  "(?:\\((?:maj|sus|add|no|omit|M|b|#)?\\d{1,2}\\))?";
// A bass note sometimes gets a stray "m" ("A/C#m"); a bass note has no quality, so it is let go.
const LETTER_CHORD = new RegExp(`^(\\(?)([A-G][#b]?)(${QUALITY})(?:/([A-G][#b]?)m?)?(\\)?)$`);
const NUMBER_CHORD = new RegExp(`^(\\(?)([#b]?[1-7])(${QUALITY})(?:/([#b]?[1-7]))?(\\)?)$`);
const BASS_ONLY = /^(\(?)\/(?:([A-G][#b]?)|([#b]?[1-7]))(\)?)$/;
// Things that sit on a chord line without being chords: bars, repeats, N.C.,
// and any remark in parentheses such as "(Intro)" or "(to Chorus)".
const FILLER = /^(\|{1,2}:?|:?\|{1,2}|[-–—/%.*:]+|x\d+|\d+x|N\.?C\.?|\([^)]*\)|[()])$/i;

export function parseChord(text: string): Chord | null {
  // A backslash typed for the slash of a bass note ("D\F#") is read as the slash.
  const normal = text.replace(/♯/g, "#").replace(/♭/g, "b").replace(/\\/g, "/");
  const letter = LETTER_CHORD.exec(normal);
  if (letter) return { kind: "letter", prefix: letter[1], root: letter[2], quality: letter[3], bass: letter[4] ?? null, suffix: letter[5] };
  const number = NUMBER_CHORD.exec(normal);
  if (number) return { kind: "number", prefix: number[1], root: number[2], quality: number[3], bass: number[4] ?? null, suffix: number[5] };
  // "/E": the chord before it, over a new bass note. It has no root of its own.
  const bass = BASS_ONLY.exec(normal);
  if (bass) return { kind: bass[2] ? "letter" : "number", prefix: bass[1], root: "", quality: "", bass: bass[2] ?? bass[3], suffix: bass[4] };
  return null;
}

export type ChordDisplay = {
  // Key the chart's letter chords were typed in.
  from: Key | null;
  // Key to show letter chords in.
  to: Key | null;
  // "numbers" is Nashville (1 4 6m); "numerals" is Roman (I IV vi).
  mode: "chords" | "numbers" | "numerals";
};

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

// Roman numerals show minor and diminished by going lowercase, so the "m" or
// "dim" is dropped from what follows: Am7 is vi7, Bdim is vii°.
function numeralChord(root: string, quality: string): [string, string] {
  const lower = root.replace(/[IV]+/, (numeral) => numeral.toLowerCase());
  const halfDiminished = /^(?:m7b5|ø7?)(.*)$/.exec(quality);
  if (halfDiminished) return [lower, `ø7${halfDiminished[1]}`];
  const diminished = /^(?:dim|°)(.*)$/.exec(quality);
  if (diminished) return [lower, `°${diminished[1]}`];
  const minor = /^(?:min|m(?!aj)|-)(.*)$/.exec(quality);
  if (minor) return [lower, minor[1]];
  return [root, quality];
}

function convertNote(text: string, kind: Chord["kind"], display: ChordDisplay): string | null {
  let fn: Fn | null;
  if (kind === "number") {
    fn = numberToFn(text);
  } else {
    const note = parseNote(text);
    fn = note && display.from ? noteToFn(note, display.from) : null;
  }
  if (!fn) return null;
  if (display.mode === "numbers") return fnToNumber(fn);
  if (display.mode === "numerals") return (fn.alt < 0 ? "b".repeat(-fn.alt) : "#".repeat(fn.alt)) + ROMAN[fn.degree];
  return display.to ? fnToNoteName(fn, display.to) : null;
}

// Writes a chord in the requested key or as a number. A chord that can't be
// converted (no key known yet) comes back exactly as it was typed.
export function renderChord(chord: Chord, display: ChordDisplay): string {
  const root = chord.root === "" ? "" : convertNote(chord.root, chord.kind, display);
  const bass = chord.bass === null ? null : convertNote(chord.bass, chord.kind, display);
  const typed = chord.prefix + chord.root + chord.quality + (chord.bass ? `/${chord.bass}` : "") + chord.suffix;
  if (root === null || (chord.bass !== null && bass === null)) return typed;

  // Number charts write minor as "-"; letter chords write it as "m".
  const quality = chord.kind === "number" && display.mode === "chords" ? chord.quality.replace(/^-/, "m") : chord.quality;
  const [shownRoot, shownQuality] = display.mode === "numerals" ? numeralChord(root, quality) : [root, quality];
  return chord.prefix + shownRoot + shownQuality + (bass ? `/${bass}` : "") + chord.suffix;
}

// The key a chart should be shown in: the requested key, bent to the chart's
// own major/minor mode so "E" asked of an A minor chart means E minor.
export function resolveTargetKey(requested: string | null | undefined, chartKey: Key | null): Key | null {
  const key = parseKey(requested);
  if (!key) return chartKey;
  if (!chartKey || key.minor === chartKey.minor) return key;
  return parseKey(key.name.replace(/m$/, "") + (chartKey.minor ? "m" : "")) ?? key;
}

// The key whose chord shapes a guitarist plays with a capo on the given fret.
export function capoKey(key: Key, fret: number): Key {
  if (fret <= 0) return key;
  const semitone = mod(key.tonic.semitone - fret, 12);
  const names = key.minor ? MINOR_KEYS : MAJOR_KEYS;
  return parseKey(names.find((name) => parseKey(name)?.tonic.semitone === semitone)) ?? key;
}

// ----- Lines -----

const LABEL =
  "(?:pre[- ]?chorus|post[- ]?chorus|verse|chorus|bridge|intro|outro|tag|interlude|instrumental|inst|ending|" +
  "turnaround|turn|refrain|vamp|coda|hook|solo|breakdown|channel|misc|rap|spoken)" +
  "(?:\\s*\\d+[a-z]?)?(?:\\s*\\(?(?:x\\s*\\d+|\\d+\\s*x)\\)?)?";
// A line that is only a section name: "Verse 1", "[Chorus]", "(Chorus 2)", "Bridge x2:".
const SECTION = new RegExp(`^[\\[(]?\\s*${LABEL}\\s*[\\])]?\\s*:?\\s*$`, "i");
// A section name and colon with more after it: "Intro: G C D", "Verse: words".
// The colon can be left out when a bar line follows: "Instrumental | Am - - - |".
const LABELLED = new RegExp(`^(\\s*${LABEL}\\s*(?::|(?=\\s*\\|)))\\s*\\S`, "i");

// `heading` marks a section label sharing a line with chords ("Intro:").
// `glued` marks a piece typed hard against the one before it ("|Bm" is a bar
// line and a chord), so the two stay together when the line is written out.
export type Token = { col: number; text: string; chord: Chord | null; heading?: boolean; glued?: true };

// Bars written tight against their chords, as in "|Bm", "A/C#|" or "D-F#m-|E":
// the pieces, each a chord or a filler, or null if this is just a word.
function splitBars(text: string): { at: number; text: string; chord: Chord | null }[] | null {
  if (!/[|-]/.test(text)) return null;
  const pieces: { at: number; text: string; chord: Chord | null }[] = [];
  for (const part of text.matchAll(/\|+|[^|]+/g)) {
    const chord = parseChord(part[0]);
    if (chord || FILLER.test(part[0])) {
      pieces.push({ at: part.index, text: part[0], chord });
      continue;
    }
    // Beats marked with dashes and no spaces: "D-F#m-".
    for (const beat of part[0].matchAll(/-+|[^-]+/g)) {
      const beatChord = parseChord(beat[0]);
      if (!beatChord && !FILLER.test(beat[0])) return null;
      pieces.push({ at: part.index + beat.index, text: beat[0], chord: beatChord });
    }
  }
  return pieces;
}

export type SourceLine =
  | { type: "empty" }
  | { type: "section"; text: string }
  | { type: "chords"; tokens: Token[] }
  // `label` is how many leading characters are a section label ("VERSE:").
  | { type: "lyric"; text: string; label?: number };

// Decides what one typed line is, without looking at its neighbours.
export function classifyLine(raw: string): SourceLine {
  const line = raw.replace(/\t/g, "    ").replace(/\s+$/, "");
  if (line.trim() === "") return { type: "empty" };
  if (SECTION.test(line) || /^[^[\]]{1,30}:$/.test(line.trim())) {
    return { type: "section", text: line.trim().replace(/^[[(]\s*|\s*[\])]$|\s*[\])]?\s*:$/g, "") };
  }

  // A section label at the start is set aside and always bold; what follows
  // it decides whether this is a line of chords or of lyrics.
  const label = LABELLED.exec(line)?.[1] ?? "";
  const lyric: SourceLine = label ? { type: "lyric", text: line, label: label.length } : { type: "lyric", text: line };

  const tokens: Token[] = label ? [{ col: label.length - label.trimStart().length, text: label.trim(), chord: null, heading: true }] : [];
  // A remark in parentheses counts as one piece even if it has spaces in it.
  for (const match of line.slice(label.length).matchAll(/\([^)]*\)|\S+/g)) {
    const col = label.length + match.index;
    const chord = parseChord(match[0]);
    if (chord || FILLER.test(match[0])) {
      tokens.push({ col, text: match[0], chord });
      continue;
    }
    const pieces = splitBars(match[0]);
    if (!pieces) return lyric;
    pieces.forEach((piece, n) => tokens.push({ col: col + piece.at, text: piece.text, chord: piece.chord, ...(n > 0 ? { glued: true as const } : {}) }));
  }
  return tokens.some((t) => t.chord) ? { type: "chords", tokens } : lyric;
}

export type Segment = { token: Token | null; text: string };

export type ChartLine =
  | { type: "empty" }
  | { type: "section"; text: string }
  | { type: "chords"; tokens: Token[] }
  | { type: "lyric"; segments: Segment[]; label?: number };

// "[G]Amazing [C]grace" -> segments, leaving brackets that aren't chords alone.
function bracketSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let current: Segment = { token: null, text: "" };
  let last = 0;
  for (const match of text.matchAll(/\[([^\]\s]+)\]/g)) {
    const chord = parseChord(match[1]);
    if (!chord) continue;
    current.text += text.slice(last, match.index);
    if (current.token || current.text) segments.push(current);
    current = { token: { col: match.index, text: match[1], chord }, text: "" };
    last = match.index + match[0].length;
  }
  current.text += text.slice(last);
  if (current.token || current.text) segments.push(current);
  return segments;
}

// Hangs each chord of a chord line over the lyric character beneath it. Each
// piece of lyric is padded to its chord's column so the pieces, joined back
// together, are the lyric line exactly as it was typed.
function stackSegments(tokens: Token[], lyric: string): Segment[] {
  const segments: Segment[] = [];
  if (tokens[0].col > 0) segments.push({ token: null, text: lyric.slice(0, tokens[0].col).padEnd(tokens[0].col) });
  tokens.forEach((token, i) => {
    const next = tokens[i + 1];
    const text = lyric.slice(token.col, next?.col);
    segments.push({ token, text: next ? text.padEnd(next.col - token.col) : text });
  });
  return segments;
}

// Writes chords onto one line at their columns. A chord that has grown (G to
// Ab) pushes the next one right just enough to keep a space between them,
// unless the next one was typed hard against it (`glued`).
export function layoutChords(items: { col: number; text: string; glued?: true }[]) {
  let line = "";
  for (const item of items) {
    line = line.padEnd(line === "" ? item.col : Math.max(item.col, line.length + (item.glued ? 0 : 1))) + item.text;
  }
  return line;
}

export function parseChart(text: string): ChartLine[] {
  const source = text.replace(/\r\n?/g, "\n").split("\n").map(classifyLine);
  const lines: ChartLine[] = [];

  for (let i = 0; i < source.length; i++) {
    const line = source[i];
    const next = source[i + 1];
    // Chords belong to the lyric line under them, unless that line brings its
    // own chords in brackets or opens a new section with a label.
    if (line.type === "chords" && next?.type === "lyric" && !next.label && !bracketSegments(next.text).some((s) => s.token)) {
      lines.push({ type: "lyric", segments: stackSegments(line.tokens, next.text) });
      i++;
    } else if (line.type === "chords") {
      lines.push(line);
    } else if (line.type === "lyric") {
      lines.push({ type: "lyric", segments: bracketSegments(line.text), ...(line.label ? { label: line.label } : {}) });
    } else {
      lines.push(line);
    }
  }

  // Drop blank lines at the very end.
  while (lines.at(-1)?.type === "empty") lines.pop();
  return lines;
}

export function chartHasChords(text: string) {
  return parseChart(text).some(
    (line) =>
      (line.type === "chords" && line.tokens.some((t) => t.chord)) ||
      (line.type === "lyric" && line.segments.some((s) => s.token?.chord))
  );
}

// A starting guess for the key of a chart typed in letter chords: its first chord.
export function guessKey(text: string): string | null {
  for (const line of parseChart(text)) {
    const tokens = line.type === "chords" ? line.tokens : line.type === "lyric" ? line.segments.map((s) => s.token) : [];
    const chord = tokens.find((t) => t?.chord?.kind === "letter" && t.chord.root)?.chord;
    if (chord) return chord.root + (/^(m(?!aj)|min|-)/.test(chord.quality) ? "m" : "");
  }
  return null;
}
