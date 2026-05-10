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
    expect(result.svgPath).toBe("");
    expect(result.markers).toEqual([]);
});
test("buildChartPath single point: centres dot, no svgPath, no NaN", () => {
    const result = buildChartPath([makePoint()], 375, 220);
    expect(result.svgPath).toBe("");
    expect(result.markers.length).toBe(1);
    expect(Number.isFinite(result.markers[0].cx)).toBeTruthy();
    expect(Number.isFinite(result.markers[0].cy)).toBeTruthy();
});
test("buildChartPath two points: svgPath starts with M and contains L", () => {
    const points = [
        makePoint({ date: "2026-03-01", estimatedE1rmKg: 100 }),
        makePoint({ date: "2026-03-08", estimatedE1rmKg: 110 }),
    ];
    const result = buildChartPath(points, 375, 220);
    expect(result.svgPath.startsWith("M ")).toBeTruthy();
    expect(result.svgPath.includes(" L ")).toBeTruthy();
    expect(result.markers.length).toBe(2);
    expect(result.markers[0].cx < result.markers[1].cx).toBeTruthy();
});
test("buildChartPath skips points where estimatedE1rmKg is null", () => {
    const points = [
        makePoint({ estimatedE1rmKg: 100 }),
        makePoint({ estimatedE1rmKg: null }),
        makePoint({ estimatedE1rmKg: 110 }),
    ];
    const result = buildChartPath(points, 375, 220);
    expect(result.markers.length).toBe(2);
});
test("buildChartPath preserves decisionOutcome on markers", () => {
    const points = [
        makePoint({ estimatedE1rmKg: 100, decisionOutcome: "increase_load" }),
        makePoint({ estimatedE1rmKg: 110, decisionOutcome: null }),
    ];
    const result = buildChartPath(points, 375, 220);
    expect(result.markers[0].outcome).toBe("increase_load");
    expect(result.markers[1].outcome).toBe(null);
});
