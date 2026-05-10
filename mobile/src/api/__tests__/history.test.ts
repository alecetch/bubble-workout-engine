import { normalizeSessionHistoryMetrics, normalizeWeeklyVolumeByRegion, } from "../historyNormalizers";
test("normalizeWeeklyVolumeByRegion returns structured upper/lower/full arrays", () => {
    const raw = {
        upper: [{ weekStart: "2026-03-02T00:00:00Z", volumeLoad: 4200 }],
        lower: [{ weekStart: "2026-03-02", volumeLoad: 5100 }],
        full: [],
    };
    const result = normalizeWeeklyVolumeByRegion(raw);
    expect(result.upper[0].weekStart).toBe("2026-03-02");
    expect(result.upper[0].volumeLoad).toBe(4200);
    expect(result.lower[0].volumeLoad).toBe(5100);
    expect(result.full).toEqual([]);
});
test("normalizeWeeklyVolumeByRegion returns empty arrays when field is missing", () => {
    const result = normalizeWeeklyVolumeByRegion({});
    expect(result).toEqual({ upper: [], lower: [], full: [] });
});
test("normalizeSessionHistoryMetrics includes weeklyVolumeByRegion8w", () => {
    const raw = {
        dayStreak: 5,
        consistency28d: { completed: 8, scheduled: 12, rate: 0.67 },
        volume28d: 48000,
        strengthUpper28d: { exerciseId: "bench_press", exerciseName: "Bench Press", bestE1rmKg: 110, trendPct: 0.1 },
        strengthLower28d: { exerciseId: "bb_back_squat", exerciseName: "Barbell Back Squat", bestE1rmKg: 150, trendPct: null },
        sessionsCount: 20,
        programmesCompleted: 2,
        weeklyVolumeByRegion8w: {
            upper: [{ weekStart: "2026-03-02", volumeLoad: 3000 }],
            lower: [],
            full: [{ weekStart: "2026-03-02", volumeLoad: 6000 }],
        },
    };
    const result = normalizeSessionHistoryMetrics(raw);
    expect(result.dayStreak).toBe(5);
    expect(result.strengthUpper28d?.exerciseId).toBe("bench_press");
    expect(result.strengthLower28d?.exerciseId).toBe("bb_back_squat");
    expect(result.weeklyVolumeByRegion8w.upper[0].volumeLoad).toBe(3000);
    expect(result.weeklyVolumeByRegion8w.lower).toEqual([]);
    expect(result.weeklyVolumeByRegion8w.full[0].weekStart).toBe("2026-03-02");
});
test("normalizeSessionHistoryMetrics weeklyVolumeByRegion8w defaults to empty when absent", () => {
    const raw = {
        dayStreak: 0,
        consistency28d: { completed: 0, scheduled: 0, rate: 0 },
        volume28d: 0,
        strengthUpper28d: null,
        strengthLower28d: null,
        sessionsCount: 0,
        programmesCompleted: 0,
    };
    const result = normalizeSessionHistoryMetrics(raw);
    expect(result.weeklyVolumeByRegion8w).toEqual({ upper: [], lower: [], full: [] });
});
