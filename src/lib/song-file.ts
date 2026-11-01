// Reads a song file, such as one downloaded from SongSelect: ChordPro with its {directives},
// or the plain text version, where the title is the first line and the details are at the
// end. Pure, so it can be tested. The chart keeps its [G]chords, which charts understand.

export type SongFile = {
  title: string;
  author: string | null;
  ccliNumber: string | null;
  key: string | null;
  bpm: number | null;
  meter: string | null;
  copyright: string | null;
  chart: string;
};

const SECTION_NAMES: Record<string, string> = { verse: "Verse", chorus: "Chorus", bridge: "Bridge", tab: "Tab", grid: "Grid" };

function fromFileName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
}

export function parseSongFile(text: string, fileName: string): SongFile | null {
  const details: Partial<Record<"title" | "author" | "key" | "bpm" | "meter" | "copyright" | "ccli", string>> = {};
  const lines: string[] = [];
  const authors: string[] = [];
  let directives = 0;

  const raw = text.replace(/^﻿/, "").split(/\r?\n/);
  for (const source of raw) {
    const line = source.trimEnd();
    if (/^#/.test(line)) continue;

    const directive = /^\s*\{\s*([a-zA-Z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/.exec(line);
    if (directive) {
      directives++;
      const name = directive[1].toLowerCase();
      const value = directive[2]?.trim() ?? "";
      if (name === "title" || name === "t") details.title = value;
      else if (name === "artist" || name === "composer" || name === "lyricist" || name === "author" || name === "subtitle" || name === "st") authors.push(value);
      else if (name === "key") details.key = value;
      else if (name === "tempo") details.bpm = value;
      else if (name === "time") details.meter = value;
      else if (name === "copyright") details.copyright = value;
      else if (name === "ccli") details.ccli = value;
      else if (name === "comment" || name === "c" || name === "ci" || name === "cb") lines.push(`${value}:`);
      else if (name.startsWith("start_of_") || /^so[cvb]$/.test(name)) {
        const kind = { soc: "chorus", sov: "verse", sob: "bridge" }[name] ?? name.slice("start_of_".length);
        lines.push(`${value || SECTION_NAMES[kind] || kind}:`);
      }
      continue;
    }

    // The closing lines SongSelect adds to a file. They're details, not part of the song.
    const number = /^\s*CCLI\s*Song\s*#?\s*:?\s*(\d+)/i.exec(line);
    if (number) {
      details.ccli ??= number[1];
      continue;
    }
    if (/^\s*CCLI\s*Licen[sc]e/i.test(line) || /SongSelect/i.test(line)) continue;
    if (/^\s*(©|\(c\)\s*\d|Copyright\b)/i.test(line)) {
      details.copyright ??= line.trim();
      continue;
    }
    const key = /^\s*Key\s*[-:]\s*([A-G][#b]?m?)\s*$/.exec(line);
    if (key) {
      details.key ??= key[1];
      continue;
    }
    lines.push(line);
  }

  // Plain text has its title on the first line.
  if (directives === 0) {
    while (lines.length > 0 && lines[0].trim() === "") lines.shift();
    if (lines.length > 1) details.title = lines.shift()?.trim();
  }

  const chart = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!chart) return null;

  const bpm = Math.round(Number(details.bpm));
  return {
    title: (details.title || fromFileName(fileName) || "Untitled").slice(0, 200),
    author: authors.filter(Boolean).join(", ") || null,
    ccliNumber: details.ccli?.replace(/\D/g, "").slice(0, 12) || null,
    key: details.key || null,
    bpm: bpm >= 20 && bpm <= 400 ? bpm : null,
    meter: details.meter || null,
    copyright: details.copyright || null,
    chart,
  };
}
