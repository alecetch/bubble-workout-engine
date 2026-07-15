import assert from "node:assert/strict";
import test, { describe, it } from "node:test";
import { buildRecommendations } from "../recommendationBuilder.js";

const mockAnalysis = Object.freeze({
  headline: {
    biggestLimiter: {
      segmentKey: "sled_pull",
      label: "Sled Pull",
      type: "station",
      percentile: 18,
      timeGapSeconds: 120,
    },
  },
  limiters: [],
  scores: { engineScore: 50, strengthScore: 70 },
  timePotential: { headlineGainSeconds: 120 },
  roxzoneAnalysis: { available: true, percentile: 35 },
  runningAnalysis: { available: true, runFadePct: 4 },
});

function enrichedAnalysis(overrides = {}) {
  return {
    headline: {
      biggestLimiter: {
        segmentKey: "wall_balls",
        label: "Wall Balls",
        type: "station",
        timeGapSeconds: 120,
        percentile: 34,
        confidence: "high",
      },
    },
    timePotential: { headlineGainSeconds: 695 },
    scores: { engineScore: 55, strengthScore: 60 },
    segments: [],
    stationBreakdown: [],
    penalties: [],
    roxzoneAnalysis: { available: false },
    runningAnalysis: { available: false },
    ...overrides,
  };
}

const targetStationAnalysis = Object.freeze({
  headline: {
    biggestLimiter: {
      segmentKey: "wall_balls",
      label: "Wall Balls",
      type: "station",
      percentile: 8,
      timeGapSeconds: 324,
      confidence: "high",
    },
  },
  timePotential: { goalBasedGainSeconds: 324, headlineGainSeconds: 324 },
  stationBreakdown: [
    { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 324, confidence: "high", percentile: 8 },
    { segmentKey: "burpee_broad_jump", label: "Burpee Broad Jump", timeGapSeconds: 259, confidence: "high", percentile: 18 },
    { segmentKey: "sandbag_lunges", label: "Sandbag Lunges", timeGapSeconds: 180, confidence: "high", percentile: 25 },
  ],
  segments: [
    { segmentKey: "wall_balls", timeGapToExactTargetSeconds: 324 },
    { segmentKey: "burpee_broad_jump", timeGapToExactTargetSeconds: 259 },
    { segmentKey: "sandbag_lunges", timeGapToExactTargetSeconds: 180 },
  ],
  benchmarkContext: {
    goalBenchmarkGroup: { key: "open_f_sub_70", label: "1:10:00 finishers" },
  },
  scores: { engineScore: 55, strengthScore: 60 },
  penalties: [],
  roxzoneAnalysis: { available: false },
  runningAnalysis: { available: false },
});

const targetAthleteContext = Object.freeze({ targetFinishTimeSeconds: 4200 });

test("past race does not force taper recommendations", () => {
  const recommendations = buildRecommendations(mockAnalysis, [], { raceDate: "2020-01-01" });

  assert.notEqual(recommendations[0]?.actionId, "maintain_taper");
  assert.equal(recommendations.some((item) => /Race day is close/i.test(item.rationale)), false);
});

test("unknown race date does not force taper recommendations", () => {
  const recommendations = buildRecommendations(mockAnalysis, [], {});

  assert.notEqual(recommendations[0]?.actionId, "maintain_taper");
  assert.equal(recommendations.some((item) => /Race day is close/i.test(item.rationale)), false);
});

test("station limiter rationale with target time uses accurate phrasing", () => {
  const recs = buildRecommendations(targetStationAnalysis, [], targetAthleteContext);
  const first = recs[0];
  assert.ok(!first.rationale.includes("across your stations and penalties"),
    `rationale should not say "across your stations and penalties", got: ${first.rationale}`);
  assert.ok(first.rationale.includes("approximately"),
    `rationale should include "approximately", got: ${first.rationale}`);
});

test("title station is excluded from contributors list", () => {
  const recs = buildRecommendations(targetStationAnalysis, [], targetAthleteContext);
  const first = recs[0];
  const contributorLabels = (first.contributors ?? []).map((c) => c.label);
  assert.ok(!contributorLabels.includes("Wall Balls"),
    `contributors should not include title station "Wall Balls", got: ${JSON.stringify(contributorLabels)}`);
});

test("other high-gap stations remain in contributors after deduplication", () => {
  const recs = buildRecommendations(targetStationAnalysis, [], targetAthleteContext);
  const first = recs[0];
  const contributorLabels = (first.contributors ?? []).map((c) => c.label);
  assert.ok(contributorLabels.some((l) => l === "Burpee Broad Jump"),
    `contributors should still contain "Burpee Broad Jump", got: ${JSON.stringify(contributorLabels)}`);
});

test("past race recommendations share the next-block horizon", () => {
  const recommendations = buildRecommendations(mockAnalysis, [], { raceDate: "2020-01-01" });
  const uniqueHorizons = new Set(recommendations.map((item) => item.timeHorizon));

  assert.equal(uniqueHorizons.size, 1);
  assert.equal([...uniqueHorizons][0], "Next training block");
});

test("station contributors array is populated when two stations exceed threshold", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [
      { label: "Wall Balls", timeGapSeconds: 80, confidence: "high" },
      { label: "Sandbag Lunges", timeGapSeconds: 70, confidence: "high" },
    ],
  }), [], {});

  const labels = (recommendations[0].contributors ?? []).map((contributor) => contributor.label);
  assert.ok(!labels.includes("Wall Balls"), "Title station should not repeat in contributors");
  assert.ok(labels.includes("Sandbag Lunges"), "Sandbag Lunges should be in contributors");
  assert.doesNotMatch(recommendations[0].rationale, /Likely contributors/);
});

test("gap breakdown is omitted when only one station exceeds threshold", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [{ label: "Wall Balls", timeGapSeconds: 80, confidence: "high" }],
  }));

  assert.doesNotMatch(recommendations[0].rationale, /Likely contributors/);
});

test("station and penalty contributors appear in contributors array, not rationale", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [{ label: "Wall Balls", timeGapSeconds: 80, confidence: "high" }],
    penalties: [{ station: "run_5", penaltySeconds: 300 }],
  }), [], {});

  const stationRec = recommendations.find((recommendation) => recommendation.actionId?.startsWith("station_"));
  const labels = (stationRec?.contributors ?? []).map((contributor) => contributor.label);
  assert.ok(labels.includes("Penalties"), "Penalties should be in contributors");
  assert.ok(!labels.includes("Wall Balls"), "Title station should not repeat in contributors");
  assert.doesNotMatch(stationRec?.rationale ?? "", /Penalties/);
});

test("running gap appears as runGapNote, not in contributors", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [
      { label: "Wall Balls", timeGapSeconds: 80, confidence: "high" },
      { label: "Sandbag Lunges", timeGapSeconds: 70, confidence: "high" },
    ],
    segments: [
      { segmentKey: "run_1", type: "run", timeGapToMedianSeconds: 120 },
      { segmentKey: "run_2", type: "run", timeGapToMedianSeconds: 120 },
    ],
  }), [], {});

  const contributorLabels = (recommendations[0].contributors ?? []).map((contributor) => contributor.label);
  assert.ok(!contributorLabels.some((label) => /run|pace/i.test(label)), "Running must not be a station contributor");
  assert.ok(recommendations[0].runGapNote, "runGapNote should be set when run gap >= 60s");
  assert.match(recommendations[0].runGapNote, /running|gap/i);
});

test("running gap below threshold produces no runGapNote", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [
      { label: "Wall Balls", timeGapSeconds: 80, confidence: "high" },
      { label: "Sandbag Lunges", timeGapSeconds: 70, confidence: "high" },
    ],
    segments: [{ segmentKey: "run_1", type: "run", timeGapToMedianSeconds: 20 }],
  }), [], {});

  assert.ok(!recommendations[0].runGapNote, "runGapNote should be null when run gap < 60s");
});

test("inferred roxzone is excluded from gap breakdown", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [{ label: "Wall Balls", timeGapSeconds: 80, confidence: "high" }],
    penalties: [{ station: "run_5", penaltySeconds: 300 }],
    roxzoneAnalysis: { available: true, mode: "inferred_total", percentile: 20 },
    segments: [{ segmentKey: "roxzone_time", type: "aggregate", timeGapToMedianSeconds: 90 }],
  }));

  assert.doesNotMatch(recommendations[0].rationale, /Transitions \(Roxzone\)/);
});

test("explicit low-percentile roxzone is surfaced as its own recommendation", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [{ label: "Wall Balls", timeGapSeconds: 80, confidence: "high" }],
    penalties: [{ station: "run_5", penaltySeconds: 300 }],
    roxzoneAnalysis: { available: true, mode: "explicit_splits", percentile: 30 },
    segments: [{ segmentKey: "roxzone_time", type: "aggregate", timeGapToMedianSeconds: 90 }],
  }));

  const roxRec = recommendations.find((recommendation) => recommendation.actionId === "roxzone_rehearsal");
  assert.ok(roxRec, "Roxzone recommendation expected");
});

test("priority-2 rationale does not receive gap breakdown", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    scores: { engineScore: 40, strengthScore: 60 },
    stationBreakdown: [
      { label: "Wall Balls", timeGapSeconds: 80, confidence: "high" },
      { label: "Sandbag Lunges", timeGapSeconds: 70, confidence: "high" },
    ],
  }));

  assert.ok(recommendations[1]);
  assert.doesNotMatch(recommendations[1].rationale, /Likely contributors/);
});

test("execution-only recommendations do not include gap breakdown", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [
      { label: "Wall Balls", timeGapSeconds: 80, confidence: "high" },
      { label: "Sandbag Lunges", timeGapSeconds: 70, confidence: "high" },
    ],
  }), [], { daysToRace: 5 });

  assert.equal(recommendations[0].actionId, "race_pacing");
  assert.equal(recommendations.some((item) => /Likely contributors/.test(item.rationale)), false);
});

test("no limiter returns recommendations without throwing", () => {
  const recommendations = buildRecommendations(enrichedAnalysis({
    headline: { biggestLimiter: null },
    scores: { engineScore: 40, strengthScore: 60 },
  }));

  assert.ok(recommendations.length > 0);
});

test("pacing rationale includes started_too_fast language when diagnosis is started_too_fast", () => {
  const recs = buildRecommendations(enrichedAnalysis({
    runningAnalysis: {
      available: true,
      runFadePct: 10,
      interpretation: "late_fade_present",
      run1PacingDiagnosis: "started_too_fast",
      run1VsMedianPct: 9.5,
    },
  }), [], {});
  const pacingRec = recs.find((recommendation) => recommendation.actionId === "race_pacing");
  assert.ok(pacingRec, "pacing recommendation expected");
  assert.match(pacingRec.rationale, /too-fast|opening/i);
});

test("pacing rationale uses late-fade language when diagnosis is appropriate", () => {
  const recs = buildRecommendations(enrichedAnalysis({
    runningAnalysis: {
      available: true,
      runFadePct: 10,
      interpretation: "late_fade_present",
      run1PacingDiagnosis: "appropriate",
      run1VsMedianPct: 2,
    },
  }), [], {});
  const pacingRec = recs.find((recommendation) => recommendation.actionId === "race_pacing");
  assert.ok(pacingRec, "pacing recommendation expected");
  assert.match(pacingRec.rationale, /station fatigue|later legs/i);
});

test("exactly 8% manageable run fade does not produce pacing-under-fatigue recommendation", () => {
  const recs = buildRecommendations(enrichedAnalysis({
    runningAnalysis: {
      available: true,
      runFadePct: 8,
      interpretation: "manageable_late_fade",
      run1PacingDiagnosis: "appropriate",
    },
  }), [], {});

  assert.equal(recs.some((recommendation) => recommendation.actionId === "race_pacing" && recommendation.title === "Pacing under fatigue"), false);
  assert.doesNotMatch(recs.map((recommendation) => recommendation.rationale).join(" "), /Run fade was 8%/i);
});

test("late-fade interpretation produces pacing-under-fatigue recommendation", () => {
  const recs = buildRecommendations(enrichedAnalysis({
    runningAnalysis: {
      available: true,
      runFadePct: 9,
      interpretation: "late_fade_present",
      run1PacingDiagnosis: "appropriate",
    },
  }), [], {});
  const pacingRec = recs.find((recommendation) => recommendation.actionId === "race_pacing");

  assert.ok(pacingRec, "pacing recommendation expected");
  assert.match(pacingRec.rationale, /Run fade was 9%/i);
});

test("contributors sub-list has no single-item list when only one station", () => {
  const recs = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [{ label: "Wall Balls", timeGapSeconds: 80, confidence: "high" }],
  }), [], {});

  assert.ok((recs[0].contributors ?? []).length <= 1);
});

test("contributors do not include running even when run gap is large", () => {
  const recs = buildRecommendations(enrichedAnalysis({
    stationBreakdown: [
      { label: "Wall Balls", timeGapSeconds: 80, confidence: "high" },
      { label: "Sandbag Lunges", timeGapSeconds: 70, confidence: "high" },
    ],
    segments: [
      { segmentKey: "run_1", type: "run", timeGapToMedianSeconds: 200 },
      { segmentKey: "run_2", type: "run", timeGapToMedianSeconds: 200 },
    ],
  }), [], {});
  const contributorLabels = (recs[0].contributors ?? []).map((contributor) => contributor.label);
  assert.ok(!contributorLabels.some((label) => /run|pace|km/i.test(label)), "contributors must not include running");
});

test("no penalties means no penalty contributor", () => {
  const recs = buildRecommendations(enrichedAnalysis({
    penalties: [],
    stationBreakdown: [
      { label: "Wall Balls", timeGapSeconds: 80, confidence: "high" },
      { label: "Sandbag Lunges", timeGapSeconds: 70, confidence: "high" },
    ],
  }), [], {});
  const contributorLabels = (recs[0].contributors ?? []).map((contributor) => contributor.label);
  assert.ok(!contributorLabels.includes("Penalties"), "No penalty contributor when penalties is empty");
});

describe("buildRecommendations - roxzone enrichment", () => {
  it("roxzone recommendation rationale includes percentile and gap text", () => {
    const analysis = {
      headline: { biggestLimiter: null },
      limiters: [],
      scores: { engineScore: 55, strengthScore: 55 },
      stationBreakdown: [],
      penalties: [],
      segments: [],
      timePotential: { headlineGainSeconds: 0 },
      roxzoneAnalysis: { available: true, mode: "explicit_splits", percentile: 35, timeGapToMedianSeconds: 55 },
      runningAnalysis: { available: false },
    };
    const recs = buildRecommendations(analysis, [], {});
    const roxRec = recs.find((r) => r.actionId === "roxzone_rehearsal");
    assert.ok(roxRec, "Roxzone recommendation expected");
    assert.match(roxRec.rationale, /35th|36th|34th/i);
    assert.match(roxRec.rationale, /55|0:55/);
  });

  it("inferred_total roxzone is separated from station contributors when gap >= 30s", () => {
    const analysis = {
      headline: { biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 120, percentile: 34, confidence: "high" } },
      timePotential: { headlineGainSeconds: 120 },
      stationBreakdown: [{ label: "Wall Balls", timeGapSeconds: 120, confidence: "high", percentile: 34 }],
      penalties: [],
      segments: [],
      roxzoneAnalysis: { available: true, mode: "inferred_total", percentile: 30, timeGapToMedianSeconds: 50 },
      runningAnalysis: { available: false },
      scores: {},
    };
    const recs = buildRecommendations(analysis, [], {});
    const mainRec = recs[0];
    const labels = (mainRec.contributors ?? []).map((contributor) => contributor.label);
    assert.ok(!labels.includes("Transitions (estimated)"), "Estimated transitions should not be a station contributor");
  });

  it("inferred roxzone still gets a transition recommendation", () => {
    const analysis = {
      headline: { biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 200, percentile: 20, confidence: "high" } },
      timePotential: { headlineGainSeconds: 200 },
      stationBreakdown: [{ label: "Wall Balls", timeGapSeconds: 200, confidence: "high", percentile: 20 }],
      penalties: [],
      segments: [],
      roxzoneAnalysis: { available: true, mode: "inferred_total", percentile: 28, timeGapToMedianSeconds: 65 },
      runningAnalysis: { available: false },
      scores: {},
    };
    const recs = buildRecommendations(analysis, [], {});
    const roxRec = recs.find((recommendation) => recommendation.actionId === "roxzone_rehearsal");
    assert.ok(roxRec, "Roxzone recommendation expected");
  });
});

test("analyse mode with no positive gap uses preserve-strengths rationale", () => {
  const result = buildRecommendations(
    {
      penalties: [],
      stationBreakdown: [],
      segments: [],
      scores: { engineScore: 70, strengthScore: 68 },
      timePotential: { headlineGainSeconds: 0 },
      runningAnalysis: { available: false },
      roxzoneAnalysis: { available: false },
      headline: { biggestLimiter: null },
      benchmarkContext: { goalBenchmarkGroup: null },
    },
    [],
    {},
    "analyse",
  );
  assert.ok(result.length > 0);
  assert.doesNotMatch(result.map((r) => r.rationale).join(" "), /Against.*finishers/i);
  assert.ok(result.some((r) => /maintain|strengths|preserv/i.test(r.title + r.rationale)));
});

test("target mode with target time includes target time in rationale", () => {
  const result = buildRecommendations(
    {
      penalties: [],
      stationBreakdown: [
        { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 164, percentile: 34, confidence: "high", timeGapToExactTargetSeconds: 120 },
      ],
      segments: [
        { segmentKey: "wall_balls", type: "station", timeGapToExactTargetSeconds: 120, timeGapToMedianSeconds: 164, timeGapToGoalSeconds: null },
      ],
      scores: { engineScore: 55, strengthScore: 55 },
      timePotential: { headlineGainSeconds: 164 },
      runningAnalysis: { available: false },
      roxzoneAnalysis: { available: false },
      headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 164 } },
      benchmarkContext: { goalBenchmarkGroup: null },
    },
    [],
    { targetFinishTimeSeconds: 3300 },
    "target",
  );
  const allText = result.map((r) => r.rationale).join(" ");
  assert.match(allText, /55:00/);
});

test("recommendations include category field", () => {
  const result = buildRecommendations(enrichedAnalysis(), [], {});
  assert.ok(result.length > 0);
  assert.ok(result.every((item) => ["Fitness", "Execution", "Race management"].includes(item.category)));
});

test("includes specific cues for Burpee Broad Jump limiter", () => {
  const result = buildRecommendations({
    ...enrichedAnalysis(),
    headline: {
      biggestLimiter: {
        segmentKey: "station_4_burpee_broad_jump",
        label: "Burpee Broad Jump",
        timeGapSeconds: 90,
        percentile: 15,
      },
    },
  });
  const rationale = result[0]?.rationale ?? "";
  assert.match(rationale, /rhythm|floor speed|hip extension/i);
});

test("includes standards review advice for penalty recommendation", () => {
  const result = buildRecommendations({
    ...enrichedAnalysis(),
    penalties: [{ penaltySeconds: 300, runKey: "run_5" }],
  });
  const penRec = result.find((r) => r.actionId === "penalty_avoidance");
  assert.match(penRec?.rationale ?? "", /standards|judge/i);
  assert.equal(penRec?.category, "Execution");
});
