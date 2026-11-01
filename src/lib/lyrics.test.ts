import { test } from "node:test";
import assert from "node:assert/strict";
import { findLyric, lyricLines, plainWords } from "./lyrics";

const CHART = [
  "VERSE 1",
  "G         G7        C         G",
  "Amazing grace, how sweet the sound",
  "                         D",
  "That saved a wretch like me",
  "",
  "(CHORUS)",
  "|Bm - - - |G - - - |",
  "My chains are [G]gone, I've been set [D]free",
  "Verse: Holy, holy, holy!",
].join("\n");

test("pulls only the sung lines out of a chart", () => {
  assert.deepEqual(lyricLines(CHART), ["Amazing grace, how sweet the sound", "That saved a wretch like me", "My chains are gone, I've been set free", "Holy, holy, holy!"]);
});

test("compares words without punctuation or capitals", () => {
  assert.equal(plainWords("  Holy, holy — HOLY!  I've "), "holy holy holy ive");
});

test("finds lyrics, ignoring punctuation, chords and line breaks", () => {
  assert.equal(findLyric(CHART, "how sweet the sound"), "Amazing grace, how sweet the sound");
  assert.equal(findLyric(CHART, "HOLY HOLY"), "Holy, holy, holy!");
  assert.equal(findLyric(CHART, "ive been set free"), "My chains are gone, I've been set free");
  // Across the end of one line and the start of the next.
  assert.equal(findLyric(CHART, "the sound that saved"), "Amazing grace, how sweet the sound");
  // A word still being typed.
  assert.equal(findLyric(CHART, "saved a wre"), "That saved a wretch like me");
});

test("doesn't match part-way into a word, chords, or headings", () => {
  assert.equal(findLyric(CHART, "race how"), null);
  assert.equal(findLyric(CHART, "chorus"), null);
  assert.equal(findLyric(CHART, "Bm"), null);
  assert.equal(findLyric(CHART, ""), null);
  assert.equal(findLyric(null, "grace"), null);
});
