import { classifyLine } from "@/lib/chords";

// Letters and digits only, lower case, single spaces: how words are compared
// when searching, so "Holy, holy!" finds "holy holy".
export function plainWords(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// The sung lines of a typed chord chart: no chord lines, no section headings,
// no chords in brackets, no leading "Verse:" label.
export function lyricLines(chart: string | null | undefined): string[] {
  const lines: string[] = [];
  for (const raw of (chart ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = classifyLine(raw);
    if (line.type !== "lyric") continue;
    const words = line.text
      .slice(line.label ?? 0)
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (words) lines.push(words);
  }
  return lines;
}

// Looks for some words in a chart's lyrics. The words may run across a line
// break. Returns the line they start on, to show beside the song, or null.
export function findLyric(chart: string | null | undefined, query: string): string | null {
  const wanted = plainWords(query);
  if (!wanted) return null;

  const lines = lyricLines(chart);
  const plain = lines.map(plainWords);
  const all = plain.join(" ");
  // Whole words at the start ("grace" must not match "disgrace"), but the last word may be half typed.
  const at = ` ${all}`.indexOf(` ${wanted}`);
  if (at < 0) return null;

  // Which line that position falls in.
  let start = 0;
  for (let n = 0; n < lines.length; n++) {
    const end = start + plain[n].length;
    if (at <= end) return lines[n];
    start = end + 1;
  }
  return lines.at(-1) ?? null;
}
