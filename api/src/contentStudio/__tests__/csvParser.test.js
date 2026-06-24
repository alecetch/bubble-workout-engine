import test from "node:test";
import assert from "node:assert/strict";
import { parseRaceResultsCsv } from "../csvParser.js";

const header = "rank,athlete_name,instagram_handle,finish_time,roxzone_time,run_1,skierg,run_2,sled_push,run_3,sled_pull,run_4,burpee_bj,run_5,row,run_6,farmers_carry,run_7,sandbag_lunge,run_8,wall_balls";

function validRows(count = 10) {
  return Array.from({ length: count }, (_, i) => {
    const rank = i + 1;
    return `${rank},Athlete ${rank},athlete${rank},1:30:00,2:00,4:00,4:10,4:05,4:20,4:10,4:30,4:15,4:40,4:20,4:35,4:25,4:45,4:30,4:50,4:35,5:00`;
  });
}

test("parses valid 10-row CSV with all columns", () => {
  const { rows, warnings } = parseRaceResultsCsv([header, ...validRows()].join("\n"), "open", "male");
  assert.equal(rows.length, 10);
  assert.deepEqual(warnings, []);
});

test("missing optional splits parse as null", () => {
  const csv = [header, "1,Athlete One,,1:05:00,2:00,4:00,,4:05,,,,,,,,,,,,,"].join("\n");
  const { rows } = parseRaceResultsCsv(csv, "open", "male");
  assert.equal(rows[0].splits.skierg, null);
});

test("duplicate ranks warn and still parse rows", () => {
  const rows = validRows(2);
  rows[1] = rows[1].replace(/^2,/, "1,");
  const parsed = parseRaceResultsCsv([header, ...rows].join("\n"), "open", "male");
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.warnings.some((warning) => warning.includes("Duplicate rank")), true);
});

test("missing required finish_time column throws", () => {
  assert.throws(() => parseRaceResultsCsv("rank,athlete_name\n1,Athlete", "open", "male"), /finish_time/);
});

test("unparseable optional time returns null and warns", () => {
  const csv = [header, "1,Athlete One,,1:05:00,2:00,wat,4:10,4:05,4:20,4:10,4:30,4:15,4:40,4:20,4:35,4:25,4:45,4:30,4:50,4:35,5:00"].join("\n");
  const { rows, warnings } = parseRaceResultsCsv(csv, "open", "male");
  assert.equal(rows[0].splits.run_1, null);
  assert.equal(warnings.some((warning) => warning.includes("run_1 is unparseable")), true);
});

test("instagram handle without at-sign is normalised", () => {
  const { rows } = parseRaceResultsCsv([header, ...validRows(1)].join("\n"), "open", "male");
  assert.equal(rows[0].instagramHandle, "@athlete1");
});
