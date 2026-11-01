// A song's sequence is stored as full section names, comma-separated
// ("Intro, Verse 1, Chorus, Chorus, Bridge 2"). On a song sheet there is only
// room for a short form: "Intro V1 Ch×2 Br2".

// Checked in order, so "Pre-Chorus" is tried before "Chorus".
const SHORT: [RegExp, string][] = [
  [/^pre[- ]?chorus/i, "Pre"],
  [/^post[- ]?chorus/i, "Post"],
  [/^chorus/i, "Ch"],
  [/^verse/i, "V"],
  [/^bridge/i, "Br"],
  [/^intro/i, "Intro"],
  [/^outro/i, "Outro"],
  [/^tag/i, "Tag"],
  [/^end(ing)?/i, "End"],
  [/^inst(rumental)?/i, "Inst"],
  [/^interlude/i, "Inter"],
  [/^turn(around)?/i, "Turn"],
  [/^refrain/i, "Rf"],
  [/^vamp/i, "Vamp"],
  [/^solo/i, "Solo"],
  [/^breakdown/i, "Break"],
];

// One section name, shortened: "Verse 2" is "V2", "Chorus" is "Ch". A name
// that isn't a usual section ("Key change") is kept as it is.
export function abbreviateSection(name: string) {
  const trimmed = name.trim();
  for (const [pattern, short] of SHORT) {
    const match = pattern.exec(trimmed);
    if (!match) continue;
    const rest = trimmed.slice(match[0].length).trim();
    // Only a number (or nothing) may follow, or it wasn't really that section.
    if (/^\d*[a-z]?$/i.test(rest)) return short + rest;
  }
  return trimmed;
}

// The whole sequence in short form, with a section played several times in a
// row written once: "Ch×3".
export function abbreviateSequence(sequence: string | null | undefined) {
  const parts = (sequence ?? "")
    .split(",")
    .map(abbreviateSection)
    .filter(Boolean);

  const runs: { name: string; count: number }[] = [];
  for (const name of parts) {
    const last = runs.at(-1);
    if (last?.name === name) last.count++;
    else runs.push({ name, count: 1 });
  }
  return runs.map((run) => (run.count > 1 ? `${run.name}×${run.count}` : run.name)).join(" ");
}
