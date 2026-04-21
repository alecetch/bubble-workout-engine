import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRobustEmitterRows,
  normalizeSeedMode,
  weekWeight,
  rirForWeek,
  parseReps,
} from "../src/routes/adminSeedHistory.js";

test("weekWeight returns base weight at week 0", () => {
  assert.equal(weekWeight("lower", 0, 12), 100);
  assert.equal(weekWeight("upper", 0, 12), 70);
  assert.equal(weekWeight("full", 0, 12), 80);
  assert.equal(weekWeight(null, 0, 12), 60);
});

test("weekWeight increases 15% by final week, rounded to 2.5 kg", () => {
  const final = weekWeight("lower", 11, 12);
  assert.ok(final > 100);
  assert.equal(final % 2.5, 0);
  assert.equal(final, 115);
});

test("rirForWeek returns 3 in early weeks and 1 in late weeks", () => {
  assert.equal(rirForWeek(0, 12), 3);
  assert.equal(rirForWeek(11, 12), 1);
});

test("parseReps handles range string", () => {
  assert.equal(parseReps("8-12"), 10);
  assert.equal(parseReps("4–6"), 5);
});

test("parseReps handles single number and fallbacks", () => {
  assert.equal(parseReps("5"), 5);
  assert.equal(parseReps(null), 8);
  assert.equal(parseReps(""), 8);
});

test("normalizeSeedMode defaults to robust", () => {
  assert.equal(normalizeSeedMode(undefined), "robust");
  assert.equal(normalizeSeedMode("robust"), "robust");
  assert.equal(normalizeSeedMode("quick"), "quick");
});

test("buildRobustEmitterRows creates requested 12-week program with anchor coverage", () => {
  const { rows, anchorCoverage, preferredDays } = buildRobustEmitterRows({
    weeks: 12,
    daysPerWeek: 3,
    preferredDays: ["mon", "wed", "fri"],
  });

  assert.equal(anchorCoverage.bb_back_squat, 12);
  assert.equal(anchorCoverage.bb_bench_press, 12);
  assert.equal(anchorCoverage.bb_bentover_row, 12);
  assert.deepEqual(preferredDays, ["mon", "wed", "fri"]);

  const prg = rows.find((row) => row.startsWith("PRG|"));
  assert.ok(prg);
  assert.ok(prg.includes("|12|3|"));

  const weekRows = rows.filter((row) => row.startsWith("WEEK|"));
  const dayRows = rows.filter((row) => row.startsWith("DAY|"));
  const exRows = rows.filter((row) => row.startsWith("EX|"));

  assert.equal(weekRows.length, 12);
  assert.equal(dayRows.length, 36);
  assert.ok(exRows.some((row) => row.includes("|bb_back_squat|")));
  assert.ok(exRows.some((row) => row.includes("|bb_bench_press|")));
  assert.ok(exRows.some((row) => row.includes("|bb_bentover_row|")));
});
