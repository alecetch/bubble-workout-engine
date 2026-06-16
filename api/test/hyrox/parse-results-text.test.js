import assert from "node:assert/strict";
import test from "node:test";
import { parseHyroxResultsText } from "../../src/hyrox/ingestion/parseHyroxResultsText.js";

// Real-world format from results.hyrox.com detail page (select-all copy)
// Labels include parenthesized distances: "Running 1 (1,000 m)", "Row (1,000 m)", etc.
const REAL_WORLD_PASTE = `
Name\tVelasquez, Diego
Nation\tUSA
Age Group\tM40

Race\tSingapore HYROX
Date\t12 October 2024

Segment\tTime\tRank
Running 1 (1,000 m)\t0:04:52\t234 / 15
SkiErg (1,000 m)\t0:07:05\t189 / 11
Running 2 (1,000 m)\t0:03:50\t167 / 9
Sled Push (50 m)\t0:05:48\t143 / 8
Running 3 (1,000 m)\t0:03:55\t156 / 10
Sled Pull (50 m)\t0:04:42\t134 / 7
Running 4 (1,000 m)\t0:04:08\t178 / 12
Burpee Broad Jump (80 m)\t0:08:30\t201 / 13
Running 5 (1,000 m)\t0:09:00\t289 / 18
Row (1,000 m)\t0:06:05\t165 / 10
Running 6 (1,000 m)\t0:04:02\t145 / 9
Farmers Carry (200 m)\t0:03:43\t134 / 8
Running 7 (1,000 m)\t0:04:15\t156 / 10
Sandbag Lunges (100 m)\t0:05:55\t178 / 12
Running 8 (1,000 m)\t0:04:22\t167 / 11
Wall Balls (100 reps)\t0:08:05\t189 / 12

Roxzone Time\t0:05:23
Overall Time\t1:08:45

Judging Decision\t-
*Penalty\tRUN 5 (300s)

Best Run Lap\tRunning 2\t0:03:50
Run Total\t0:32:09
`.trim();

test("real-world paste with (1,000 m) distance suffixes parses all 16 splits", () => {
  const result = parseHyroxResultsText(REAL_WORLD_PASTE);
  assert.equal(result.splits.length, 16, `expected 16 splits, got ${result.splits.length}`);
  assert.equal(result.confidence, "high");
  assert.equal(result.success, true);
});

test("real-world paste: finish time and roxzone parsed", () => {
  const result = parseHyroxResultsText(REAL_WORLD_PASTE);
  assert.equal(result.finishTimeSeconds, 1 * 3600 + 8 * 60 + 45, "finish time");
  assert.equal(result.roxzoneSeconds, 5 * 60 + 23, "roxzone time");
});

test("real-world paste: athlete name and age group parsed", () => {
  const result = parseHyroxResultsText(REAL_WORLD_PASTE);
  assert.equal(result.athleteName, "Velasquez, Diego");
  assert.equal(result.ageGroup, "M40");
});

test("real-world paste: *Penalty line extracted", () => {
  const result = parseHyroxResultsText(REAL_WORLD_PASTE);
  assert.equal(result.penalties.length, 1);
  assert.equal(result.penalties[0].segmentKey, "run_5");
  assert.equal(result.penalties[0].penaltySeconds, 300);
});

test("real-world paste: Row (1,000 m) maps to row segment", () => {
  const result = parseHyroxResultsText(REAL_WORLD_PASTE);
  const row = result.splits.find((s) => s.segmentKey === "row");
  assert.ok(row, "row segment found");
  assert.equal(row.timeSeconds, 6 * 60 + 5);
});

test("real-world paste: Best Run Lap and Run Total lines do not produce spurious splits", () => {
  const result = parseHyroxResultsText(REAL_WORLD_PASTE);
  const spurious = result.splits.filter((s) => !s.segmentKey.startsWith("run_") && !["ski_erg","sled_push","sled_pull","burpee_broad_jump","row","farmers_carry","sandbag_lunges","wall_balls"].includes(s.segmentKey));
  assert.equal(spurious.length, 0);
});

test("Rowing label (alternate spelling) maps to row segment", () => {
  const text = "Rowing (1,000 m)\t0:06:05";
  const result = parseHyroxResultsText(text);
  const row = result.splits.find((s) => s.segmentKey === "row");
  assert.ok(row, "Rowing maps to row");
  assert.equal(row.timeSeconds, 6 * 60 + 5);
});

// MM:SS format — results.hyrox.com shows individual split times without leading hours
const MM_SS_PASTE = `
Name\tVelasquez, Diego
Age Group\tM40

Segment\tTime\tRank
Running 1 (1,000 m)\t4:52\t234 / 15
SkiErg (1,000 m)\t7:05\t189 / 11
Running 2 (1,000 m)\t3:50\t167 / 9
Sled Push (50 m)\t5:48\t143 / 8
Running 3 (1,000 m)\t3:55\t156 / 10
Sled Pull (50 m)\t4:42\t134 / 7
Running 4 (1,000 m)\t4:08\t178 / 12
Burpee Broad Jump (80 m)\t8:30\t201 / 13
Running 5 (1,000 m)\t9:00\t289 / 18
Row (1,000 m)\t6:05\t165 / 10
Running 6 (1,000 m)\t4:02\t145 / 9
Farmers Carry (200 m)\t3:43\t134 / 8
Running 7 (1,000 m)\t4:15\t156 / 10
Sandbag Lunges (100 m)\t5:55\t178 / 12
Running 8 (1,000 m)\t4:22\t167 / 11
Wall Balls (100 reps)\t8:05\t189 / 12

Roxzone Time\t0:05:23
Overall Time\t1:08:45
`.trim();

test("MM:SS split times: all 16 splits parsed", () => {
  const result = parseHyroxResultsText(MM_SS_PASTE);
  assert.equal(result.splits.length, 16, `expected 16, got ${result.splits.length}`);
  assert.equal(result.confidence, "high");
  assert.equal(result.success, true);
});

test("MM:SS split times: individual times parsed correctly", () => {
  const result = parseHyroxResultsText(MM_SS_PASTE);
  const run1 = result.splits.find((s) => s.segmentKey === "run_1");
  assert.ok(run1, "run_1 found");
  assert.equal(run1.timeSeconds, 4 * 60 + 52, "run_1 = 4:52 = 292s");
  const ski = result.splits.find((s) => s.segmentKey === "ski_erg");
  assert.ok(ski, "ski_erg found");
  assert.equal(ski.timeSeconds, 7 * 60 + 5, "ski_erg = 7:05 = 425s");
});

test("MM:SS split times: H:MM:SS overall and roxzone still parsed correctly", () => {
  const result = parseHyroxResultsText(MM_SS_PASTE);
  assert.equal(result.finishTimeSeconds, 1 * 3600 + 8 * 60 + 45, "finish = 1:08:45");
  assert.equal(result.roxzoneSeconds, 5 * 60 + 23, "roxzone = 0:05:23");
});
