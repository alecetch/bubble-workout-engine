import test from "node:test";
import assert from "node:assert/strict";
import { buildStrengthRegionMetricFromRows } from "../src/routes/sessionHistoryMetrics.js";

test("buildStrengthRegionMetricFromRows includes exerciseId for strength regions", () => {
  const rows = [
    {
      region: "upper",
      exercise_id: "bb_bench_press",
      exercise_name: "Barbell Bench Press",
      current_best: 120,
      prev_best: 110,
    },
    {
      region: "lower",
      exercise_id: "bb_back_squat",
      exercise_name: "Barbell Back Squat",
      current_best: 160,
      prev_best: 150,
    },
  ];

  const upper = buildStrengthRegionMetricFromRows(rows, "upper");
  const lower = buildStrengthRegionMetricFromRows(rows, "lower");

  assert.equal(upper?.exerciseId, "bb_bench_press");
  assert.equal(upper?.exerciseName, "Barbell Bench Press");
  assert.equal(lower?.exerciseId, "bb_back_squat");
  assert.equal(lower?.exerciseName, "Barbell Back Squat");
});
