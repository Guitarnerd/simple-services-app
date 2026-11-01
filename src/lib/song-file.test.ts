import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChart } from "./chords";
import { parseSongFile } from "./song-file";

const CHORDPRO = `{title: Test Hymn}
{artist: Ann Writer}
{composer: Bo Writer}
{key: G}
{tempo: 72}
{time: 3/4}
{ccli: 1234567}
{copyright: 2001 Test Music}

{comment: Verse 1}
[G]First line of [C]words
[D]Second line

{start_of_chorus}
[C]Chorus [G]words
{end_of_chorus}

CCLI Song # 1234567
For use solely with the SongSelect Terms of Use. All rights reserved.
CCLI License # 999
`;

test("ChordPro: the details come out and the chart stays", () => {
  const song = parseSongFile(CHORDPRO, "ignored.chordpro");
  assert.ok(song);
  assert.equal(song.title, "Test Hymn");
  assert.equal(song.author, "Ann Writer, Bo Writer");
  assert.equal(song.ccliNumber, "1234567");
  assert.equal(song.key, "G");
  assert.equal(song.bpm, 72);
  assert.equal(song.meter, "3/4");
  assert.equal(song.copyright, "2001 Test Music");
  assert.equal(song.chart, "Verse 1:\n[G]First line of [C]words\n[D]Second line\n\nChorus:\n[C]Chorus [G]words");
});

test("a church's licence number and SongSelect's terms stay out of the chart", () => {
  const song = parseSongFile(CHORDPRO, "a.cho");
  assert.ok(song);
  assert.doesNotMatch(song.chart, /CCLI|SongSelect|999/);
});

test("the chart it makes reads as sections and chords", () => {
  const song = parseSongFile(CHORDPRO, "a.cho");
  assert.ok(song);
  const lines = parseChart(song.chart);
  assert.equal(lines[0].type, "section");
  assert.ok(lines.some((line) => line.type !== "section" && JSON.stringify(line).includes('"G"')));
});

test("plain text: the title is the first line and the details are at the end", () => {
  const song = parseSongFile(
    `Test Hymn

Verse 1
G       C
First line of words

CCLI Song # 42
© 2001 Test Music
For use solely with the SongSelect® Terms of Use.
CCLI License # 999
`,
    "whatever.txt"
  );
  assert.ok(song);
  assert.equal(song.title, "Test Hymn");
  assert.equal(song.ccliNumber, "42");
  assert.equal(song.copyright, "© 2001 Test Music");
  assert.match(song.chart, /^Verse 1\nG {7}C\nFirst line of words$/);
});

test("Windows line endings and a byte order mark are fine", () => {
  const song = parseSongFile("﻿{title: A}\r\n[G]Words\r\n", "a.cho");
  assert.equal(song?.title, "A");
  assert.equal(song?.chart, "[G]Words");
});

test("the file's name stands in for a missing title", () => {
  assert.equal(parseSongFile("[G]Words\n{key: G}", "Amazing_Grace.cho")?.title, "Amazing Grace");
});

test("a nonsense tempo is left out", () => {
  assert.equal(parseSongFile("{tempo: fast}\n[G]Words", "a.cho")?.bpm, null);
});

test("a file with no song in it is refused", () => {
  assert.equal(parseSongFile("{title: Empty}\n\n", "a.cho"), null);
  assert.equal(parseSongFile("", "a.txt"), null);
});
