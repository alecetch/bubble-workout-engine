import assert from "node:assert/strict";
import test from "node:test";
import { buildChartPath } from "./chartUtils";
import type { ExerciseHistoryPoint } from "../../api/history";

function makePoint(overrides: Partial<ExerciseHistoryPoint> = {}): ExerciseHistoryPoint {
  return {
    date: "2026-03-01",
    topWeightKg: 100,
    tonnage: 500,
    topReps: 5,
    estimatedE1rmKg: 115,
    decisionOutcome: null,
    decisionPrimaryLever: null,
    ...overrides,
  };
}

test("buildChartPath returns empty svgPath and markers for empty series", () => {
  const result = buildChartPath([], 375, 220);
  assert.equal(result.svgPath, "");
  assert.deepEqual(result.markers, []);
});

test("buildChartPath single point: centres dot, no svgPath, no NaN", () => {
  const result = buildChartPath([makePoint()], 375, 220);
  assert.equal(result.svgPath, "");
  assert.equal(result.markers.length, 1);
  assert.ok(Number.isFinite(result.markers[0].cx));
  assert.ok(Number.isFinite(result.markers[0].cy));
});

test("buildChartPath two points: svgPath starts with M and contains L", () => {
  const points = [
    makePoint({ date: "2026-03-01", estimatedE1rmKg: 100 }),
    makePoint({ date: "2026-03-08", estimatedE1rmKg: 110 }),
  ];
  const result = buildChartPath(points, 375, 220);
  assert.ok(result.svgPath.startsWith("M "));
  assert.ok(result.svgPath.includes(" L "));
  assert.equal(result.markers.length, 2);
  assert.ok(result.markers[0].cx < result.markers[1].cx);
});

test("buildChartPath skips points where estimatedE1rmKg is null", () => {
  const points = [
    makePoint({ estimatedE1rmKg: 100 }),
    makePoint({ estimatedE1rmKg: null }),
    makePoint({ estimatedE1rmKg: 110 }),
  ];
  const result = buildChartPath(points, 375, 220);
  assert.equal(result.markers.length, 2);
});

test("buildChartPath preserves decisionOutcome on markers", () => {
  const points = [
    makePoint({ estimatedE1rmKg: 100, decisionOutcome: "increase_load" }),
    makePoint({ estimatedE1rmKg: 110, decisionOutcome: null }),
  ];
  const result = buildChartPath(points, 375, 220);
  assert.equal(result.markers[0].outcome, "increase_load");
  assert.equal(result.markers[1].outcome, null);
});
