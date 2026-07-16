import assert from "node:assert/strict";
import test from "node:test";
import { buildHyroxRaceCardData } from "../src/hyrox/reports/raceCardDataMapper.js";

// Shared fixture — a complete analysisJson with all fields populated
function makeAnalysisJson(overrides = {}) {
  return {
    athlete: {
      name: "FERNANDES, MARCUS",
      division: "open",
    },
    race: {
      finishTimeSeconds: 3548,   // 59:08
      targetTimeSeconds: 3300,   // 55:00
    },
    scores: {
      overallPerformanceScore: 91,
    },
    headline: {
      biggestStrength: {
        segmentKey: "ski_erg",
        label: "SkiErg",
        percentile: 87,
      },
      biggestLimiter: {
        segmentKey: "sandbag_lunges",
        label: "Sandbag Lunges",
        percentile: 3,
        timeGapSeconds: 81,
        confidence: "high",
      },
      headlineGainSeconds: 81,
      projectedTimeSeconds: 3467,
    },
    timePotential: {
      headlineGainSeconds: 81,
    },
    benchmarkContext: {
      comparisonOptions: [
        { id: "global", label: "Global", groupKey: "open_male", topPercent: 1, percentile: 99, sampleSize: 5000 },
        { id: "age_group", label: "Age group", groupKey: "open_male_25_29", topPercent: 2, percentile: 98, sampleSize: 800 },
      ],
    },
    segments: [
      { segmentKey: "ski_erg", label: "SkiErg", type: "station", userSeconds: 240, frameGapSeconds: -18, percentile: 87 },
      { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 360, frameGapSeconds: 63, percentile: 40 },
      { segmentKey: "sled_push", label: "Sled Push", type: "station", userSeconds: 300, frameGapSeconds: 12, percentile: 62 },
      { segmentKey: "run_2", label: "Run 2", type: "run", userSeconds: 370, frameGapSeconds: 43, percentile: 42 },
      { segmentKey: "sled_pull", label: "Sled Pull", type: "station", userSeconds: 290, frameGapSeconds: 5, percentile: 55 },
      { segmentKey: "run_3", label: "Run 3", type: "run", userSeconds: 355, frameGapSeconds: 28, percentile: 48 },
      { segmentKey: "burpee_broad_jump", label: "Burpee Broad Jump", type: "station", userSeconds: 320, frameGapSeconds: 9, percentile: 58 },
      { segmentKey: "run_4", label: "Run 4", type: "run", userSeconds: 375, frameGapSeconds: 50, percentile: 38 },
      { segmentKey: "row", label: "Rowing", type: "station", userSeconds: 280, frameGapSeconds: -8, percentile: 72 },
      { segmentKey: "run_5", label: "Run 5", type: "run", userSeconds: 380, frameGapSeconds: 55, percentile: 35 },
      { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", userSeconds: 270, frameGapSeconds: -5, percentile: 65 },
      { segmentKey: "run_6", label: "Run 6", type: "run", userSeconds: 390, frameGapSeconds: 60, percentile: 32 },
      { segmentKey: "sandbag_lunges", label: "Sandbag Lunges", type: "station", userSeconds: 400, frameGapSeconds: 81, percentile: 3 },
      { segmentKey: "run_7", label: "Run 7", type: "run", userSeconds: 385, frameGapSeconds: 57, percentile: 36 },
      { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 310, frameGapSeconds: 7, percentile: 60 },
      { segmentKey: "run_8", label: "Run 8", type: "run", userSeconds: 340, frameGapSeconds: -43, percentile: 78 },
      // Aggregates — must be excluded from splitRows
      { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 3548, frameGapSeconds: 0, percentile: 99 },
      { segmentKey: "run_time", label: "Total running", type: "aggregate", userSeconds: 2955, frameGapSeconds: 30, percentile: 60 },
    ],
    ...overrides,
  };
}

// ── Golden path ─────────────────────────────────────────────────────────────

test("golden path — all fields populated", () => {
  const data = buildHyroxRaceCardData(makeAnalysisJson({ calculatorMode: "target" }), { displayName: "Marcus Fernandes" });

  assert.equal(data.athleteName, "Marcus Fernandes");
  assert.equal(data.finishTime, "59:08");
  assert.equal(data.targetTime, "55:00");
  assert.equal(data.percentileText, "TOP 1% WORLDWIDE");
  assert.equal(data.formaScore, 99); // comparisonOptions[0].percentile, not overallPerformanceScore
  assert.equal(data.mode, "target");
  assert.equal(data.isDoubles, false);

  assert.ok(data.strongestStation, "strongestStation should be present");
  assert.equal(data.strongestStation.name, "SkiErg");
  assert.equal(data.strongestStation.percentile, "Top 13%");

  assert.ok(data.biggestLimiter, "biggestLimiter should be present");
  assert.equal(data.biggestLimiter.name, "Sandbag Lunges");
  assert.equal(data.biggestLimiter.potentialGain, "+1:21");
  assert.equal(data.biggestLimiter.rankText, "3rd percentile");
});

// ── formaScore fallback ──────────────────────────────────────────────────────

test("null formaScore when no comparison options and no overallPerformanceScore", () => {
  const aj = makeAnalysisJson({ scores: {}, benchmarkContext: { comparisonOptions: null } });
  const data = buildHyroxRaceCardData(aj);
  assert.equal(data.formaScore, null);
});

test("formaScore uses comparisonOptions[0].percentile when available", () => {
  // scores.overallPerformanceScore = 40 (band-mode peer score) but global percentile = 99
  const aj = makeAnalysisJson({ scores: { overallPerformanceScore: 40 } });
  const data = buildHyroxRaceCardData(aj);
  assert.equal(data.formaScore, 99); // picks compOpts[0].percentile, not 40
});

test("formaScore falls back to overallPerformanceScore when comparisonOptions is empty", () => {
  const aj = makeAnalysisJson({ benchmarkContext: { comparisonOptions: { defaultId: "global", options: [] } } });
  const data = buildHyroxRaceCardData(aj);
  assert.equal(data.formaScore, 91); // falls back to scores.overallPerformanceScore
});

test("percentileText falls back to demographic percentile when comparisonOptions is empty", () => {
  const aj = makeAnalysisJson({
    benchmarkContext: { comparisonOptions: { defaultId: "global", options: [] } },
    segments: [
      { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 3548, fieldPercentile: 65, percentile: 40 },
      { segmentKey: "ski_erg", label: "SkiErg", type: "station", userSeconds: 240, frameGapSeconds: -18, percentile: 87 },
    ],
  });
  const data = buildHyroxRaceCardData(aj);

  assert.equal(data.percentileText, "Top 35%");
});

// ── Mode / target time ───────────────────────────────────────────────────────

test("mode is analyse when targetTimeSeconds is null", () => {
  const aj = makeAnalysisJson({ race: { finishTimeSeconds: 3548, targetTimeSeconds: null } });
  const data = buildHyroxRaceCardData(aj);
  assert.equal(data.mode, "analyse");
  assert.equal(data.targetTime, null);
});

// ── Missing limiter / strength ───────────────────────────────────────────────

test("biggestLimiter is null when headline.biggestLimiter is null", () => {
  const aj = makeAnalysisJson({ headline: { ...makeAnalysisJson().headline, biggestLimiter: null } });
  const data = buildHyroxRaceCardData(aj);
  assert.equal(data.biggestLimiter, null);
});

test("strongestStation is null when headline.biggestStrength is null", () => {
  const aj = makeAnalysisJson({ headline: { ...makeAnalysisJson().headline, biggestStrength: null } });
  const data = buildHyroxRaceCardData(aj);
  assert.equal(data.strongestStation, null);
});

// ── Split rows ───────────────────────────────────────────────────────────────

test("splitRows excludes aggregate segments", () => {
  const data = buildHyroxRaceCardData(makeAnalysisJson());
  const keys = data.splitRows.map((r) => r.key);
  assert.ok(!keys.includes("total_time"), "total_time should be excluded");
  assert.ok(!keys.includes("run_time"), "run_time should be excluded");
});

test("splitRows includes all 16 race events in race order", () => {
  const data = buildHyroxRaceCardData(makeAnalysisJson());
  assert.deepEqual(
    data.splitRows.map((r) => r.key),
    [
      "run_1",
      "ski_erg",
      "run_2",
      "sled_push",
      "run_3",
      "sled_pull",
      "run_4",
      "burpee_broad_jump",
      "run_5",
      "row",
      "run_6",
      "farmers_carry",
      "run_7",
      "sandbag_lunges",
      "run_8",
      "wall_balls",
    ],
  );
});

test("splitRow tone is positive for negative frameGapSeconds", () => {
  // ski_erg has frameGapSeconds -18 (faster than benchmark)
  const data = buildHyroxRaceCardData(makeAnalysisJson());
  const skiRow = data.splitRows.find((r) => r.key === "ski_erg");
  if (skiRow) assert.equal(skiRow.tone, "positive");
});

test("splitRow tone is negative for positive frameGapSeconds", () => {
  // sandbag_lunges has frameGapSeconds 81 (slower)
  const data = buildHyroxRaceCardData(makeAnalysisJson());
  const lungesRow = data.splitRows.find((r) => r.key === "sandbag_lunges");
  if (lungesRow) assert.equal(lungesRow.tone, "negative");
});

test("splitRows prefer frameGapSeconds over goal-derived gap when both are present", () => {
  const data = buildHyroxRaceCardData(makeAnalysisJson({
    calculatorMode: "analyse",
    benchmarkContext: {
      goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "55:00 target" },
      comparisonOptions: [],
    },
    segments: [
      { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 3548, frameGapSeconds: 248, percentile: 65 },
      {
        segmentKey: "run_1",
        label: "Run 1",
        type: "run",
        userSeconds: 300,
        goalBenchmarkSeconds: 250,
        frameGapSeconds: -12,
        timeGapToMedianSeconds: 20,
        percentile: 70,
      },
    ],
  }));
  const runRow = data.splitRows.find((r) => r.key === "run_1");

  assert.equal(runRow.delta, "-0:12");
  assert.equal(runRow.tone, "positive");
});

// ── Time formatting ──────────────────────────────────────────────────────────

test("finishTime formats 3548 seconds as 59:08", () => {
  const data = buildHyroxRaceCardData(makeAnalysisJson());
  assert.equal(data.finishTime, "59:08");
});

test("potentialGain formats 81 seconds as +1:21", () => {
  const data = buildHyroxRaceCardData(makeAnalysisJson());
  assert.equal(data.biggestLimiter?.potentialGain, "+1:21");
});

// ── Doubles flag ─────────────────────────────────────────────────────────────

test("isDoubles is true for doubles_mixed division", () => {
  const aj = makeAnalysisJson({ athlete: { name: "Test Team", division: "doubles_mixed" } });
  const data = buildHyroxRaceCardData(aj);
  assert.equal(data.isDoubles, true);
});

test("isDoubles is false for open division", () => {
  const data = buildHyroxRaceCardData(makeAnalysisJson());
  assert.equal(data.isDoubles, false);
});

// ── Athlete name resolution ───────────────────────────────────────────────────

test("athleteName prefers athleteContext.displayName over athlete.name", () => {
  const data = buildHyroxRaceCardData(makeAnalysisJson(), { displayName: "Display Override" });
  assert.equal(data.athleteName, "Display Override");
});

test("athleteName falls back to athlete.name when context has no displayName", () => {
  const data = buildHyroxRaceCardData(makeAnalysisJson(), {});
  assert.equal(data.athleteName, "FERNANDES, MARCUS");
});

// ── Null-safety ───────────────────────────────────────────────────────────────

test("returns safe defaults when analysisJson is null", () => {
  const data = buildHyroxRaceCardData(null);
  assert.equal(data.athleteName, "HYROX Athlete");
  assert.equal(data.finishTime, null);
  assert.equal(data.formaScore, null);
  assert.equal(data.splitRows.length, 0);
});
