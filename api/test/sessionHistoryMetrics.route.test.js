import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStrengthRegionMetricFromRows,
  computeDayStreak,
  createSessionHistoryMetricsHandler,
  mapWeeklyVolumeRows,
} from "../src/routes/sessionHistoryMetrics.js";

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

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

test("mapWeeklyVolumeRows returns upper/lower/full arrays keyed by week_start", () => {
  const rows = [
    { week_start: "2026-03-03", region: "upper", volume_load: "4500" },
    { week_start: "2026-03-03", region: "lower", volume_load: "6000" },
    { week_start: "2026-03-03", region: "full", volume_load: "200" },
    { week_start: "2026-03-10", region: "upper", volume_load: "4800" },
    { week_start: "2026-03-10", region: "lower", volume_load: "0" },
    { week_start: "2026-03-10", region: "full", volume_load: "0" },
  ];

  const result = mapWeeklyVolumeRows(rows);

  assert.equal(result.upper.length, 2);
  assert.equal(result.lower.length, 2);
  assert.equal(result.full.length, 2);
  assert.equal(result.upper[0].weekStart, "2026-03-03");
  assert.equal(result.upper[0].volumeLoad, 4500);
  assert.equal(result.lower[0].volumeLoad, 6000);
  assert.equal(result.full[0].volumeLoad, 200);
  assert.equal(result.upper[1].weekStart, "2026-03-10");
});

test("buildStrengthRegionMetricFromRows computes positive trendPct when current > prev", () => {
  const rows = [
    { region: "upper", exercise_id: "bb_bench", exercise_name: "Bench Press", current_best: "110", prev_best: "100" },
  ];
  const result = buildStrengthRegionMetricFromRows(rows, "upper");
  assert.equal(result?.exerciseId, "bb_bench");
  assert.ok(result?.trendPct != null && result.trendPct > 0);
  assert.ok(Math.abs(result.trendPct - 0.1) < 0.001);
});

test("buildStrengthRegionMetricFromRows returns null trendPct when no prev period", () => {
  const rows = [
    { region: "lower", exercise_id: "bb_squat", exercise_name: "Barbell Squat", current_best: "140", prev_best: null },
  ];
  const result = buildStrengthRegionMetricFromRows(rows, "lower");
  assert.equal(result?.trendPct, null);
});

test("buildStrengthRegionMetricFromRows returns null when region has no rows", () => {
  const rows = [
    { region: "upper", exercise_id: "bb_bench", exercise_name: "Bench Press", current_best: "110", prev_best: null },
  ];
  const result = buildStrengthRegionMetricFromRows(rows, "lower");
  assert.equal(result, null);
});

test("dayStreak counts consecutive completed days and stops at first incomplete", async () => {
  let callCount = 0;
  const db = {
    async connect() {
      return {
        async query() {
          callCount += 1;
          const responses = [
            {
              rows: [
                { scheduled_date: "2026-04-18", is_completed: true },
                { scheduled_date: "2026-04-17", is_completed: true },
                { scheduled_date: "2026-04-16", is_completed: false },
                { scheduled_date: "2026-04-15", is_completed: true },
              ],
            },
            { rows: [{ scheduled: "10", completed: "8" }] },
            { rows: [{ volume: "50000" }] },
            { rows: [] },
            { rows: [{ count: "12" }] },
            { rows: [{ count: "1" }] },
            { rows: [] },
          ];
          return responses[callCount - 1] ?? { rows: [] };
        },
        release() {},
      };
    },
  };

  const handler = createSessionHistoryMetricsHandler(db);
  const res = createMockRes();
  await handler({ auth: { user_id: "user-1" }, request_id: "req-1" }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dayStreak, 2);
});

test("computeDayStreak counts consecutive completed days", () => {
  const rows = [
    { scheduled_date: "2026-04-18", is_completed: true },
    { scheduled_date: "2026-04-17", is_completed: true },
    { scheduled_date: "2026-04-16", is_completed: true },
  ];
  assert.equal(computeDayStreak(rows), 3);
});

test("computeDayStreak breaks on gap in consecutive days", () => {
  const rows = [
    { scheduled_date: "2026-04-18", is_completed: true },
    { scheduled_date: "2026-04-16", is_completed: true },
    { scheduled_date: "2026-04-15", is_completed: true },
  ];
  assert.equal(computeDayStreak(rows), 1);
});

test("computeDayStreak returns 0 when first row is incomplete", () => {
  const rows = [
    { scheduled_date: "2026-04-18", is_completed: false },
    { scheduled_date: "2026-04-17", is_completed: true },
  ];
  assert.equal(computeDayStreak(rows), 0);
});

test("computeDayStreak ignores duplicate rows for the same activity date", () => {
  const rows = [
    { scheduled_date: "2026-04-18", is_completed: true },
    { scheduled_date: "2026-04-18", is_completed: true },
    { scheduled_date: "2026-04-17", is_completed: true },
    { scheduled_date: "2026-04-16", is_completed: true },
  ];
  assert.equal(computeDayStreak(rows), 3);
});

test("handler returns sessionsCount28d separately from consistency", async () => {
  let callCount = 0;
  const db = {
    async connect() {
      return {
        async query() {
          callCount += 1;
          const responses = [
            {
              rows: [
                { scheduled_date: "2026-04-18", is_completed: true },
                { scheduled_date: "2026-04-17", is_completed: true },
              ],
            },
            { rows: [{ scheduled: "10", completed: "8" }] },
            { rows: [{ volume: "50000" }] },
            { rows: [] },
            { rows: [{ count: "12" }] },
            { rows: [{ count: "7" }] },
            { rows: [{ count: "1" }] },
            { rows: [] },
          ];
          return responses[callCount - 1] ?? { rows: [] };
        },
        release() {},
      };
    },
  };

  const handler = createSessionHistoryMetricsHandler(db);
  const res = createMockRes();
  await handler({ auth: { user_id: "user-1" }, request_id: "req-1" }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.consistency28d.completed, 8);
  assert.equal(res.body.sessionsCount28d, 7);
});
