import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock, itemStarts, preServiceRows } from "./format";

test("rows under a Pre-service header count back from the start time; the rest run from it", () => {
  const { starts, length } = itemStarts([
    { type: "HEADER", lengthSeconds: null, preService: true },
    { type: "SONG", lengthSeconds: 360, preService: false },
    { type: "ITEM", lengthSeconds: 240, preService: false },
    { type: "HEADER", lengthSeconds: null, preService: false },
    { type: "SONG", lengthSeconds: 300, preService: false },
    { type: "ITEM", lengthSeconds: null, preService: false },
    { type: "ITEM", lengthSeconds: 240, preService: false },
  ]);
  // 6 + 4 minutes before: the first at -10:00, the second at -4:00, ending at the start.
  assert.deepEqual(starts.filter((_, i) => i !== 0 && i !== 3), [-600, -240, 0, 300, 300]);
  assert.equal(length, 540);
  assert.equal(formatClock("18:30", starts[1]), "6:20 PM");
  assert.equal(formatClock("18:30", starts[2]), "6:26 PM");
  assert.equal(formatClock("00:05", -600), "11:55 PM");
});

test("a Pre-service header covers the rows up to the next header, and rows before any header aren't pre-service", () => {
  const rows = preServiceRows([
    { type: "ITEM", preService: false },
    { type: "HEADER", preService: true },
    { type: "SONG", preService: false },
    { type: "HEADER", preService: false },
    { type: "SONG", preService: false },
  ]);
  assert.deepEqual(rows, [false, true, true, false, false]);
});

test("a plan with no pre-service rows runs from the start time", () => {
  const { starts, length } = itemStarts([
    { type: "SONG", lengthSeconds: 120, preService: false },
    { type: "ITEM", lengthSeconds: 60, preService: false },
  ]);
  assert.deepEqual(starts, [0, 120]);
  assert.equal(length, 180);
});
