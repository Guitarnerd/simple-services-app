import { test } from "node:test";
import assert from "node:assert/strict";
import { abbreviateSection, abbreviateSequence } from "./sequence";

test("shortens section names", () => {
  const cases: [string, string][] = [
    ["Intro", "Intro"],
    ["Verse 1", "V1"],
    ["Verse 2", "V2"],
    ["Chorus", "Ch"],
    ["Chorus 2", "Ch2"],
    ["Pre-Chorus", "Pre"],
    ["Pre Chorus 2", "Pre2"],
    ["Bridge", "Br"],
    ["Bridge 2", "Br2"],
    ["Tag", "Tag"],
    ["Ending", "End"],
    ["Instrumental", "Inst"],
    ["Interlude", "Inter"],
    ["Turnaround", "Turn"],
    ["Refrain", "Rf"],
    ["Vamp", "Vamp"],
    ["Outro", "Outro"],
    ["verse 3", "V3"],
  ];
  for (const [full, short] of cases) assert.equal(abbreviateSection(full), short, full);
});

test("leaves a name that isn't a usual section alone", () => {
  assert.equal(abbreviateSection("Key change"), "Key change");
  assert.equal(abbreviateSection("Versed in song"), "Versed in song");
  assert.equal(abbreviateSection("Taglines"), "Taglines");
});

test("shortens a whole sequence and folds repeats", () => {
  assert.equal(abbreviateSequence("Intro, Verse 1, Verse 2, Chorus, Bridge, Bridge 2, Tag"), "Intro V1 V2 Ch Br Br2 Tag");
  assert.equal(abbreviateSequence("Intro, Verse 1, Chorus 1, Chorus 1, Turnaround, Bridge 1, Bridge 1, Bridge 1, Chorus 1"), "Intro V1 Ch1×2 Turn Br1×3 Ch1");
  assert.equal(abbreviateSequence(""), "");
  assert.equal(abbreviateSequence(null), "");
});
