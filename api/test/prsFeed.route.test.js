import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupedByDate, mapPrRow } from "../src/routes/prsFeed.js";

test("mapPrRow returns correct API shape with exerciseId", () => {
  const row = {
    exercise_id: "bb_back_squat",
    exercise_name: "Barbell Back Squat",
    weight_kg: "120.5",
    reps_completed: "5",
    estimated_1rm_kg: "138.4",
    scheduled_date: "2026-03-15T00:00:00.000Z",
    region: "lower",
  };

  const result = mapPrRow(row);

  assert.equal(result.exerciseId, "bb_back_squat");
  assert.equal(result.exerciseName, "Barbell Back Squat");
  assert.equal(result.weightKg, 120.5);
  assert.equal(result.repsCompleted, 5);
  assert.equal(result.estimatedE1rmKg, 138.4);
  assert.equal(result.date, "2026-03-15");
  assert.equal(result.region, "lower");
  assert.equal(result.milestoneType, "weight_pr");
  assert.ok(result.exerciseId);
});

test("mapPrRow handles null estimatedE1rmKg", () => {
  const row = {
    exercise_id: "bodyweight_pullup",
    exercise_name: "Pull-up",
    weight_kg: "0",
    reps_completed: "10",
    estimated_1rm_kg: null,
    scheduled_date: "2026-03-10",
    region: null,
  };

  const result = mapPrRow(row);
  assert.equal(result.estimatedE1rmKg, null);
  assert.equal(result.region, null);
});

test("buildGroupedByDate groups rows by date preserving order", () => {
  const rows = [
    { exerciseId: "squat", date: "2026-03-01", weightKg: 120 },
    { exerciseId: "bench", date: "2026-03-01", weightKg: 100 },
    { exerciseId: "deadlift", date: "2026-03-08", weightKg: 150 },
  ];

  const groups = buildGroupedByDate(rows);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].date, "2026-03-01");
  assert.equal(groups[0].rows.length, 2);
  assert.equal(groups[1].date, "2026-03-08");
  assert.equal(groups[1].rows.length, 1);
});

test("buildGroupedByDate returns empty array for empty input", () => {
  assert.deepEqual(buildGroupedByDate([]), []);
});
