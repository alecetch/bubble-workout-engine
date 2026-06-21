import assert from "node:assert/strict";
import test from "node:test";
import { buildInterpretation } from "../hyroxInterpretationEngine.js";

function station(segmentKey, timeGapSeconds, percentile = 40, confidence = "high") {
  return { segmentKey, label: segmentKey.replace(/_/g, " "), timeGapSeconds, percentile, confidence };
}

function run(segmentKey, timeGapToMedianSeconds, percentile = 50) {
  return { segmentKey, label: segmentKey.replace(/_/g, " "), type: "run", timeGapToMedianSeconds, percentile };
}

function makeAnalysis(overrides = {}) {
  return {
    penalties: [],
    stationBreakdown: [],
    segments: [],
    runningAnalysis: { available: true, runFadePct: 0, runPattern: "even" },
    roxzoneAnalysis: { available: false },
    headline: { biggestLimiter: null },
    timePotential: { headlineGainSeconds: null },
    scores: { engineScore: 60 },
    ...overrides,
  };
}

function assertShared(result) {
  assert.equal(result.sectionOrder[0], "executive_summary");
  assert.equal(result.sectionOrder.at(-1), "recommendations");
  assert.ok(result.summaryBullets.length >= 1);
  assert.ok(["high", "medium", "low"].includes(result.primaryThesis.confidence));
}

test("penalty-heavy athlete selects penalty thesis", () => {
  const result = buildInterpretation(makeAnalysis({
    penalties: [{ penaltySeconds: 300, runKey: "run_5" }],
    stationBreakdown: [station("wall_balls", 120, 35), station("sled_pull", 80, 40)],
    race: { finishTimeSeconds: 5738 },
  }));

  assert.equal(result.primaryThesis.category, "penalty");
  assert.equal(result.sectionOrder[2], "penalty_callout");
  assert.match(result.heroCopy.headline, /FASTEST WIN/);
  assert.equal(result.heroCopy.gainDisplay, null);
  assert.match(result.summaryBullets[0], /penalt/i);
  assertShared(result);
});

test("strong runner with weak stations selects station capacity thesis", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [
      station("wall_balls", 100, 32),
      station("sandbag_lunges", 80, 23),
      station("sled_pull", 70, 25),
    ],
    segments: [run("run_1", 50), run("run_2", 50)],
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 100 } },
    timePotential: { headlineGainSeconds: 250 },
  }));

  assert.equal(result.primaryThesis.category, "station_capacity");
  assert.ok(result.sectionOrder[2] === "station_breakdown" || result.sectionOrder[2] === "biggest_strength");
  assert.doesNotMatch(result.heroCopy.headline, /ANALYSIS IS READY/);
  assert.equal(result.heroCopy.gainDisplay, "4:10");
  assert.ok(!result.heroCopy.subline.includes("4:10"), "hero subline should not repeat the hero metric");
  assert.match(result.heroCopy.subline, /target benchmark group/);
  assert.match(result.summaryBullets[0], /4:10/);
  assert.match(result.summaryBullets[0], /target benchmark group/);
  assert.doesNotMatch(result.summaryBullets[0], /4:10.*4:10/);
  assert.equal(result.summaryBullets.some((bullet) => /Running contributed/i.test(bullet)), false);
  assertShared(result);
});

test("weak runner with strong stations selects running thesis", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [station("wall_balls", 80, 55)],
    segments: [run("run_1", 110, 40), run("run_2", 110, 40), { segmentKey: "run_time", type: "aggregate", percentile: 40 }],
    runningAnalysis: { available: true, runFadePct: 12, runPattern: "positive_split" },
  }));

  assert.equal(result.primaryThesis.category, "running");
  assert.equal(result.sectionOrder[2], "running_fatigue");
  assert.match(result.heroCopy.headline, /RUNNING GAP/);
  assertShared(result);
});

test("low-confidence benchmark selects data quality thesis", () => {
  const result = buildInterpretation(makeAnalysis({
    benchmarkConfidence: "low",
    segments: [run("run_1", 10), run("run_2", 10), run("run_3", 10)],
  }));

  assert.equal(result.primaryThesis.category, "data_quality");
  assert.equal(result.heroCopy.gainDisplay, null);
  assertShared(result);
});

test("high roxzone leakage selects roxzone thesis", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [station("wall_balls", 80, 55)],
    segments: [run("run_1", 30), run("run_2", 30), { segmentKey: "roxzone_time", type: "aggregate", timeGapToMedianSeconds: 120 }],
    roxzoneAnalysis: { available: true, percentile: 28, timeGapToMedianSeconds: 120 },
  }));

  assert.equal(result.primaryThesis.category, "roxzone");
  assert.equal(result.sectionOrder[2], "roxzone_execution");
  assert.match(result.heroCopy.headline, /TRANSITION/);
  assertShared(result);
});

test("balanced athlete defaults to station capacity when station gap is higher", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [station("wall_balls", 120, 60)],
    segments: [run("run_1", 20), run("run_2", 20), run("run_3", 20), run("run_4", 20)],
  }));

  assert.equal(result.primaryThesis.category, "station_capacity");
  assert.ok(result.heroCopy.gainDisplay === null || result.heroCopy.gainDisplay !== "0:00");
  assertShared(result);
});
