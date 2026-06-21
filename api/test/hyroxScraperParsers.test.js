import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkoutSummary, parseRaceReplay } from "../src/contentStudio/hyroxScraper.js";

test("parseWorkoutSummary extracts run splits, station splits, totals, and ranks", () => {
  const rows = [
    ["f-time_01", "Run 1", "4:12", "3"],
    ["f-time_02", "Run 2", "4:20", "4"],
    ["f-time_03", "Run 3", "4:25", "5"],
    ["f-time_04", "Run 4", "4:30", "6"],
    ["f-time_05", "Run 5", "4:35", "7"],
    ["f-time_06", "Run 6", "4:40", "8"],
    ["f-time_07", "Run 7", "4:45", "9"],
    ["f-time_08", "Run 8", "4:50", "10"],
    ["f-time_11", "SkiErg", "5:01", "2"],
    ["f-time_12", "Sled Push", "6:02", "11"],
    ["f-time_13", "Sled Pull", "6:03", "12"],
    ["f-time_14", "Burpee", "6:04", "13"],
    ["f-time_15", "Row", "6:05", "14"],
    ["f-time_16", "Farmers", "6:06", "15"],
    ["f-time_17", "Sandbag", "6:07", "16"],
    ["f-time_18", "Wall Balls", "6:08", "17"],
    ["f-time_49", "Run Total", "36:17", "-"],
    ["f-time_50", "Best Run", "4:12", "-"],
    ["f-time_60", "Roxzone", "2:30", "-"],
  ].map(([cls, label, time, rank]) => `<tr class="${cls}"><th class="desc">${label}</th><td class="${cls}">${time}</td><td class=" last">${rank}</td></tr>`).join("");
  const result = parseWorkoutSummary(`<html><div id="detail-box-other"><table>${rows}</table></div></html>`);
  assert.equal(result.splits.run_1, 252);
  assert.equal(result.splits.run_8, 290);
  assert.equal(result.splits.skierg, 301);
  assert.equal(result.splits.wall_balls, 368);
  assert.equal(result.roxzoneSeconds, 150);
  assert.equal(result.splitRanks.skierg, 2);
});

test("parseWorkoutSummary returns empty splits when detail box is missing", () => {
  assert.deepEqual(parseWorkoutSummary("<html>no box here</html>").splits, {});
});

test("parseRaceReplay extracts per-station roxzone splits from diff column", () => {
  // f-time_84 (Rox In 1) is the run leg — excluded from map.
  // f-time_85 (SkiErg In) = transition from corral entry to starting machine = skierg_rox_in.
  // f-time_86 (Rox Out 1) = transition from finishing machine to exiting corral = skierg_rox_out.
  // f-time_87 (Rox In 2) is Run 2 leg — excluded. f-time_88 (Sled Push In) = sled_push_rox_in.
  const rows = [
    ["f-time_84", "3:39"],  // Run 1 — not captured
    ["f-time_85", "0:05"],  // skierg_rox_in
    ["f-time_86", "0:07"],  // skierg_rox_out
    ["f-time_87", "3:22"],  // Run 2 — not captured
    ["f-time_88", "0:08"],  // sled_push_rox_in
    ["f-time_89", "0:09"],  // sled_push_rox_out
  ].map(([cls, diff]) => `<tr class="${cls}"><th>Split</th><td>12:00</td><td>1:00:00</td><td>${diff}</td></tr>`).join("");
  const result = parseRaceReplay(`<html><div id="detail-box-splits"><table>${rows}</table></div></html>`);
  assert.equal(result.skierg_rox_in, 5);
  assert.equal(result.skierg_rox_out, 7);
  assert.equal(result.sled_push_rox_in, 8);
  assert.equal(result.sled_push_rox_out, 9);
  assert.equal(result.skierg_rox_in !== 219, true, "rox_in should not contain the run leg time");
});

test("parseRaceReplay returns empty object when detail box is missing", () => {
  assert.deepEqual(parseRaceReplay("<html>no replay</html>"), {});
});
