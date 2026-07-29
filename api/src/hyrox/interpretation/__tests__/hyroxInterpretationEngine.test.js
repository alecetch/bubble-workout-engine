import assert from "node:assert/strict";
import test from "node:test";
import { buildHeroCopy, buildInterpretation, totalRunGapSeconds, roxzoneGap, selectPrimaryCategory } from "../hyroxInterpretationEngine.js";

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
  assert.match(result.heroCopy.headline, /FIRST TARGET WIN/);
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
  assert.equal(result.heroCopy.gainDisplay, null);
  assert.match(result.heroCopy.headline, /STATION|ROUTE|WALL BALLS/i);
  assert.match(result.heroCopy.subline, /target/i);
  assert.match(result.summaryBullets[0], /target/i);
  assert.match(result.summaryBullets[0], /Wall Balls/i);
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

function highPerformerAnalysis() {
  return makeAnalysis({
    stationBreakdown: [
      { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: -120, percentile: 8, confidence: "high" },
      { segmentKey: "sandbag_lunges", label: "Sandbag Lunges", timeGapSeconds: -90, percentile: 12, confidence: "high" },
      { segmentKey: "sled_push", label: "Sled Push", timeGapSeconds: -60, percentile: 15, confidence: "high" },
    ],
    segments: [
      { segmentKey: "total_time", type: "aggregate", percentile: 10, userSeconds: 3548 },
      { segmentKey: "run_1", type: "run", timeGapToMedianSeconds: -30, percentile: 15 },
      { segmentKey: "run_2", type: "run", timeGapToMedianSeconds: -25, percentile: 18 },
      { segmentKey: "run_3", type: "run", timeGapToMedianSeconds: -20, percentile: 20 },
      { segmentKey: "run_4", type: "run", timeGapToMedianSeconds: -15, percentile: 22 },
    ],
    headline: { biggestLimiter: null },
  });
}

test("high-performer in analyse mode selects high_performer category", () => {
  const result = buildInterpretation(highPerformerAnalysis(), {}, "analyse");
  assert.equal(result.primaryThesis.category, "high_performer");
});

test("high-performer hero copy does not say OPPORTUNITY", () => {
  const result = buildInterpretation(highPerformerAnalysis(), {}, "analyse");
  assert.doesNotMatch(result.heroCopy.headline, /OPPORTUNITY/i);
  assert.match(result.heroCopy.headline, /STRONG|DROVE IT|PERCENTILE/i);
});

test("sub-60 high-performer hero copy uses marginal-gain framing", () => {
  const result = buildInterpretation(makeAnalysis({
    ...highPerformerAnalysis(),
    benchmarkContext: { achievedBand: "sub_60" },
  }), {}, "analyse");
  assert.match(result.heroCopy.headline, /SUB-60/i);
  assert.match(result.heroCopy.headline, /MARGINAL/i);
  assert.doesNotMatch(result.heroCopy.headline, /BENCHMARK BAND/i);
  assert.match(result.heroCopy.subline, /least dominant|smallest relative advantage/i);
});

test("high-performer summary bullets do not contain strength endurance priority action", () => {
  const result = buildInterpretation(highPerformerAnalysis(), {}, "analyse");
  const text = result.summaryBullets.join(" ");
  assert.doesNotMatch(text, /station.specific strength endurance/i);
});

test("high-performer in target mode does not select high_performer", () => {
  const result = buildInterpretation(highPerformerAnalysis(), {}, "target");
  assert.notEqual(result.primaryThesis.category, "high_performer");
});

test("analyse mode station_capacity hero says LEAST ALIGNED not OPPORTUNITY", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [
      station("sandbag_lunges", 60, 38),
      station("wall_balls", 40, 42),
    ],
    segments: [run("run_1", 20), run("run_2", 15), run("run_3", 10), run("run_4", 5)],
    headline: { biggestLimiter: { label: "Sandbag Lunges", segmentKey: "sandbag_lunges", timeGapSeconds: 60 } },
  }), {}, "analyse");
  assert.equal(result.primaryThesis.category, "station_capacity");
  assert.doesNotMatch(result.heroCopy.headline, /BIGGEST OPPORTUNITY/i);
  assert.match(result.heroCopy.headline, /LEAST ALIGNED/i);
});

function analysisWithFrame(frame, comparisonBand, achievedBand = "sub_70") {
  return makeAnalysis({
    stationBreakdown: [
      { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 90, percentile: 38, confidence: "high" },
      { segmentKey: "sandbag_lunges", label: "Sandbag Lunges", timeGapSeconds: 70, percentile: 42, confidence: "high" },
    ],
    segments: [run("run_1", 20), run("run_2", 15)],
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 90 } },
    benchmarkContext: {
      achievedBand,
      nextBand: "sub_65",
      analysisFrame: { frame, comparisonBand, stretchBand: frame === "competitive" ? "sub_65" : null, gapToBandMedianSeconds: -80 },
    },
  });
}

test("next_band frame hero copy references comparisonBand in headline", () => {
  const result = buildInterpretation(analysisWithFrame("next_band", "sub_65"), {}, "analyse");
  assert.match(result.heroCopy.headline, /SUB-65|NEXT BAND/i);
});

test("next_band frame summary bullets mention athlete is ahead of current band", () => {
  const result = buildInterpretation(analysisWithFrame("next_band", "sub_65"), {}, "analyse");
  const text = result.summaryBullets.join(" ");
  assert.match(text, /ahead|sub-70|next step/i);
});

test("competitive frame hero copy references current and next band", () => {
  const result = buildInterpretation(analysisWithFrame("competitive", "sub_70"), {}, "analyse");
  assert.match(result.heroCopy.headline, /sub-70|sub-65|competitive/i);
  assert.doesNotMatch(result.heroCopy.headline, /KEY TO REACHING/i);
});

test("catch_up frame in a competitive band does not claim next-band competitiveness", () => {
  const result = buildInterpretation(analysisWithFrame("catch_up", "sub_70"), {}, "analyse");

  assert.equal(result.primaryThesis.category, "station_capacity");
  assert.doesNotMatch(result.heroCopy.headline, /YOU ARE COMPETITIVE/i);
  assert.doesNotMatch(result.heroCopy.headline, /HERE IS WHAT MOVES YOU TOWARD/i);
  assert.match(result.heroCopy.headline, /LEAST ALIGNED|BIGGEST OPPORTUNITY/i);
});

test("totalRunGapSeconds uses positive frameGapSeconds from run segments", () => {
  const analysis = makeAnalysis({
    segments: [
      { segmentKey: "run_1", type: "run", frameGapSeconds: 45, timeGapToMedianSeconds: -30, percentile: 55 },
      { segmentKey: "run_2", type: "run", frameGapSeconds: -10, timeGapToMedianSeconds: -10, percentile: 45 },
    ],
    stationBreakdown: [],
    headline: { biggestLimiter: null },
  });
  assert.equal(totalRunGapSeconds(analysis), 45);
});

test("does not use 'weakness' or 'main limiter' for sub-60 athletes", () => {
  const result = buildInterpretation(makeAnalysis({
    benchmarkContext: { achievedBand: "sub_60" },
    stationBreakdown: [
      station("wall_balls", 100, 32),
      station("sandbag_lunges", 80, 23),
    ],
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 100 } },
  }), {}, "analyse");
  const allCopy = JSON.stringify(result);
  assert.doesNotMatch(allCopy, /\bweakness\b/i);
  assert.doesNotMatch(allCopy, /\bmain limiter\b/i);
});

test("headline includes 'fastest win' or 'penalties' for penalty-heavy athlete", () => {
  const result = buildInterpretation(makeAnalysis({
    penalties: [{ penaltySeconds: 300 }],
    race: { finishTimeSeconds: 5738 },
  }));
  const headline = result.primaryThesis?.headline ?? result.heroCopy?.headline ?? "";
  assert.match(String(headline), /fastest win|penalt/i);
});

test("headline references current and next band for competitive athlete", () => {
  const result = buildInterpretation(makeAnalysis({
    benchmarkContext: {
      achievedBand: "sub_70",
      nextBand: "sub_65",
      analysisFrame: { frame: "competitive", comparisonBand: "sub_70", stretchBand: "sub_65", gapToBandMedianSeconds: -30 },
    },
    stationBreakdown: [
      station("wall_balls", 90, 38),
      station("sandbag_lunges", 70, 42),
    ],
    segments: [run("run_1", 20), run("run_2", 15)],
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 90 } },
  }), {}, "analyse");
  const headline = JSON.stringify(result);
  assert.match(headline, /sub-70|sub-65/i);
});

test("competitive athlete hero headline uses em dash not plain hyphen", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [
      station("wall_balls", 120, 25),
      station("sandbag_lunges", 90, 30),
    ],
    segments: [run("run_1", -60), run("run_2", -60)],
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 120 } },
    timePotential: { headlineGainSeconds: 210 },
    benchmarkContext: {
      achievedBand: "sub_65",
      nextBand: "sub_60",
      analysisFrame: { frame: "competitive", comparisonBand: "sub_65", stretchBand: "sub_60", gapToBandMedianSeconds: -30 },
    },
  }), {}, "analyse");

  assert.ok(!result.heroCopy.headline.includes(" - "), `headline should not contain plain hyphen separator, got: ${result.heroCopy.headline}`);
  assert.ok(result.heroCopy.headline.includes(" — "), `headline should contain em dash, got: ${result.heroCopy.headline}`);
});

test("sub-60 athlete with Sandbag Lunges limiter uses station subject grammar", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [
      { segmentKey: "sandbag_lunges", label: "Sandbag Lunges", timeGapSeconds: 55, percentile: 18, confidence: "high" },
      { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 30, percentile: 45, confidence: "high" },
    ],
    headline: { biggestLimiter: { label: "Sandbag Lunges", segmentKey: "sandbag_lunges", timeGapSeconds: 55 } },
    timePotential: { headlineGainSeconds: 55 },
    benchmarkContext: {
      achievedBand: "sub_60",
      nextBand: null,
    },
  }), {}, "analyse");

  const allCopy = [result.heroCopy.headline, result.heroCopy.subline, ...result.summaryBullets].join(" ");
  assert.ok(!allCopy.includes("Sandbag Lunges is"), `should not contain "Sandbag Lunges is", got: ${allCopy}`);
  assert.ok(allCopy.includes("The Sandbag Lunges station is"), `should contain station-subject grammar, got: ${allCopy}`);
});

test("target mode penalty hero says FIRST TARGET WIN not FASTEST WIN", () => {
  const result = buildInterpretation(makeAnalysis({
    penalties: [{ penaltySeconds: 300, runKey: "run_5" }],
    stationBreakdown: [station("wall_balls", 120, 35)],
    race: { finishTimeSeconds: 5738 },
  }), {}, "target");
  assert.match(result.heroCopy.headline, /FIRST TARGET WIN/);
  assert.ok(!result.heroCopy.headline.includes("FASTEST WIN"));
});

test("target mode station_capacity hero references target when available", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [
      station("wall_balls", 120, 30),
      station("sandbag_lunges", 80, 28),
    ],
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 120 } },
    timePotential: { headlineGainSeconds: 200 },
    benchmarkContext: {
      achievedBand: "sub_70",
      goalBenchmarkGroup: { targetFinishSeconds: 3600 },
    },
  }), {}, "target");
  assert.ok(!result.heroCopy.headline.includes("HERE IS WHAT MOVES YOU TOWARD"), `got: ${result.heroCopy.headline}`);
  assert.ok(
    result.heroCopy.headline.includes("WALL BALLS") || result.heroCopy.headline.includes("ROUTE") || result.heroCopy.headline.includes("STATION"),
    `expected target-mode headline, got: ${result.heroCopy.headline}`,
  );
});

test("target mode uses selected finish target instead of benchmark median", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [
      station("wall_balls", 120, 30),
      station("sled_push", 60, 42),
    ],
    segments: [
      {
        segmentKey: "total_time",
        type: "aggregate",
        userSeconds: 3900,
        exactTargetSeconds: 3300,
        goalBenchmarkSeconds: 3543,
        timeGapToExactTargetSeconds: 600,
      },
    ],
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 120 } },
    timePotential: { headlineGainSeconds: 200 },
    benchmarkContext: {
      achievedBand: "sub_70",
      goalBenchmarkGroup: { targetFinishSeconds: 3300 },
    },
  }), {}, "target");

  const copy = [result.heroCopy.headline, result.heroCopy.subline, ...result.summaryBullets].join(" ");
  assert.match(copy, /55:00|Wall Balls/i);
  assert.ok(!copy.includes("59:03"), `should not expose benchmark median target, got: ${copy}`);
});

test("target mode: pacing category returns target-specific headline", () => {
  const result = buildHeroCopy(
    { category: "pacing" },
    {
      segments: [{ segmentKey: "total_time", type: "aggregate", exactTargetSeconds: 3600 }],
      benchmarkContext: { achievedBand: "sub_70", goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60", key: "k" } },
    },
    "target",
  );
  assert.ok(
    !result.headline.includes("YOU HAVE THE ENGINE"),
    `target mode pacing should not say "YOU HAVE THE ENGINE", got: ${result.headline}`,
  );
  assert.ok(
    result.headline.includes("STATIONS") || result.headline.includes("TARGET") || result.headline.includes("RUNNING"),
    `target mode pacing headline should be target-specific, got: ${result.headline}`,
  );
});

test("analyse mode: pacing category returns original headline", () => {
  const result = buildHeroCopy({ category: "pacing" }, {}, "analyse");
  assert.equal(result.headline, "YOU HAVE THE ENGINE — THE CEILING IS EXECUTION");
});

// B-6: gap-size guard in station_capacity + analyse fallback
test("B-6: station_capacity + analyse + large gap (>= 120s) uses BIGGEST OPPORTUNITY framing", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [
      station("wall_balls", 200, 28),
      station("sandbag_lunges", 160, 30),
    ],
    segments: [run("run_1", 20), run("run_2", 15), run("run_3", 10), run("run_4", 5)],
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 200 } },
    timePotential: { headlineGainSeconds: 200 },
  }), {}, "analyse");
  assert.equal(result.primaryThesis.category, "station_capacity");
  assert.match(result.heroCopy.headline, /BIGGEST OPPORTUNITY/i);
  assert.doesNotMatch(result.heroCopy.headline, /LEAST ALIGNED/i);
});

test("B-6: station_capacity + analyse + small gap (< 120s) keeps LEAST ALIGNED framing", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [
      station("wall_balls", 55, 42),
      station("sandbag_lunges", 40, 46),
    ],
    segments: [run("run_1", 20), run("run_2", 15), run("run_3", 10), run("run_4", 5)],
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 55 } },
    timePotential: { headlineGainSeconds: 55 },
  }), {}, "analyse");
  assert.equal(result.primaryThesis.category, "station_capacity");
  assert.match(result.heroCopy.headline, /LEAST ALIGNED/i);
  assert.doesNotMatch(result.heroCopy.headline, /BIGGEST OPPORTUNITY/i);
});

// M-8: roxzone wins over station_capacity when it is the dominant gap
test("M-8: roxzone wins over station_capacity when roxGap > stationGap and roxPct < 45", () => {
  // weakCount = 1 (below the station_capacity gate of 2), roxPct = 40 (old threshold was 35),
  // roxGap = 150 > stationGap = 80 — this is the exact case M-8 fixes.
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [station("wall_balls", 80, 45)],
    segments: [run("run_1", 10), run("run_2", 10)],
    roxzoneAnalysis: { available: true, percentile: 40, timeGapToMedianSeconds: 150 },
  }), {}, "target");
  assert.equal(result.primaryThesis.category, "roxzone");
});

test("M-8: roxzone does not override station_capacity when roxGap <= stationGap", () => {
  const result = buildInterpretation(makeAnalysis({
    stationBreakdown: [station("wall_balls", 200, 30), station("sandbag_lunges", 160, 28)],
    segments: [run("run_1", 10)],
    roxzoneAnalysis: { available: true, percentile: 40, timeGapToMedianSeconds: 100 },
  }), {}, "target");
  // stationGap = 360 > roxGap = 100, so roxzone should not win
  assert.equal(result.primaryThesis.category, "station_capacity");
});

// feature-144: hero alignment and roxzone mode-awareness fixes

test("feature-144: roxzoneGap returns frameGapSeconds when present, ignoring timeGapToMedianSeconds", () => {
  const analysisJson = {
    segments: [{ segmentKey: "roxzone_time", frameGapSeconds: -252, timeGapToMedianSeconds: 130 }],
    roxzoneAnalysis: { timeGapToMedianSeconds: 130 },
  };
  assert.equal(roxzoneGap(analysisJson), -252);
});

test("feature-144: M-8 roxzone override does not fire when frameGapSeconds is negative (athlete ahead on target)", () => {
  const analysisJson = {
    segments: [
      { segmentKey: "roxzone_time", frameGapSeconds: -252, timeGapToMedianSeconds: 130 },
      { segmentKey: "run_1", type: "run", timeGapToMedianSeconds: 1200, percentile: 50 },
      { segmentKey: "run_time", type: "aggregate", timeGapToMedianSeconds: 800, percentile: 50 },
      { segmentKey: "total_time", type: "aggregate", timeGapToMedianSeconds: 300, percentile: 40 },
    ],
    stationBreakdown: [],
    roxzoneAnalysis: { available: true, percentile: 30, timeGapToMedianSeconds: 130 },
    runningAnalysis: { available: true, runFadePct: 0 },
    headline: { biggestLimiter: null },
    timePotential: {},
    scores: { engineScore: 60 },
    penalties: [],
    benchmarkConfidence: "high",
  };
  const result = selectPrimaryCategory(analysisJson, "target");
  assert.notEqual(result, "roxzone");
});

test("feature-144: M-8 roxzone override fires when frameGapSeconds is large positive and roxPct < 45", () => {
  const analysisJson = {
    segments: [
      { segmentKey: "roxzone_time", frameGapSeconds: 150, timeGapToMedianSeconds: 130 },
      { segmentKey: "run_1", type: "run", timeGapToMedianSeconds: 10, percentile: 50 },
      { segmentKey: "run_time", type: "aggregate", timeGapToMedianSeconds: 10, percentile: 50 },
      { segmentKey: "total_time", type: "aggregate", timeGapToMedianSeconds: 200, percentile: 40 },
    ],
    stationBreakdown: [],
    roxzoneAnalysis: { available: true, percentile: 30, timeGapToMedianSeconds: 130 },
    runningAnalysis: { available: true, runFadePct: 0 },
    headline: { biggestLimiter: null },
    timePotential: {},
    scores: { engineScore: 60 },
    penalties: [],
    benchmarkConfidence: "high",
  };
  const result = selectPrimaryCategory(analysisJson, "target");
  assert.equal(result, "roxzone");
});

test("feature-144: buildHeroCopy station_capacity uses emailTopLabel instead of biggestLimiter label", () => {
  const primaryThesis = { category: "station_capacity" };
  const analysisJson = {
    headline: { biggestLimiter: { label: "Total Station Time" } },
    benchmarkContext: { goalBenchmarkGroup: { targetFinishSeconds: 4800 } },
    segments: [{ segmentKey: "total_time", type: "aggregate", exactTargetSeconds: 4800 }],
    timePotential: {},
  };
  const result = buildHeroCopy(primaryThesis, analysisJson, "target", "Run 1", "run");
  assert.match(result.headline, /RUN 1/i);
  assert.doesNotMatch(result.headline, /TOTAL STATION TIME/i);
});

test("feature-144: buildHeroCopy running category names station when emailTopSegType is station", () => {
  const primaryThesis = { category: "running" };
  const analysisJson = {
    headline: { biggestLimiter: null },
    benchmarkContext: { goalBenchmarkGroup: { targetFinishSeconds: 4800 } },
    segments: [{ segmentKey: "total_time", type: "aggregate", exactTargetSeconds: 4800 }],
    timePotential: {},
  };
  const result = buildHeroCopy(primaryThesis, analysisJson, "target", "Wall Balls", "station");
  assert.match(result.headline, /WALL BALLS/i);
});

test("running hero with station top split does not claim running is larger when station aggregate gap is larger", () => {
  const primaryThesis = { category: "running" };
  const analysisJson = {
    headline: { biggestLimiter: null },
    benchmarkContext: { goalBenchmarkGroup: { targetFinishSeconds: 3600 } },
    segments: [
      { segmentKey: "total_time", type: "aggregate", exactTargetSeconds: 3600 },
      { segmentKey: "work_time", type: "aggregate", frameGapSeconds: 247, userSeconds: 2047, goalBenchmarkSeconds: 1800 },
      { segmentKey: "run_time", type: "aggregate", frameGapSeconds: 227, userSeconds: 2027, goalBenchmarkSeconds: 1800 },
    ],
    timePotential: {},
  };

  const result = buildHeroCopy(primaryThesis, analysisJson, "target", "Sled Push", "station");
  assert.match(result.headline, /SLED PUSH/i);
  assert.doesNotMatch(result.subline, /Running is your biggest overall gap/i);
  assert.match(result.subline, /Station work is your biggest overall gap to the target/i);
});

test("analyse running hero names station top split and disambiguates aggregate vs individual gap", () => {
  const analysisJson = makeAnalysis({
    stationBreakdown: [
      { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 100, percentile: 35, confidence: "high" },
    ],
    segments: [
      { segmentKey: "wall_balls", label: "Wall Balls", type: "station", frameGapSeconds: 100, timeGapToMedianSeconds: 100 },
      { segmentKey: "run_1", label: "Run 1", type: "run", frameGapSeconds: 70, timeGapToMedianSeconds: 70, percentile: 40 },
      { segmentKey: "run_2", label: "Run 2", type: "run", frameGapSeconds: 70, timeGapToMedianSeconds: 70, percentile: 40 },
      { segmentKey: "work_time", label: "Stations", type: "aggregate", frameGapSeconds: 100, timeGapToMedianSeconds: 100 },
      { segmentKey: "run_time", label: "Running", type: "aggregate", frameGapSeconds: 140, timeGapToMedianSeconds: 140, percentile: 40 },
    ],
    runningAnalysis: { available: true, runFadePct: 9, runPattern: "positive_split" },
    headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 100 } },
  });

  assert.equal(selectPrimaryCategory(analysisJson, "analyse"), "running");

  const result = buildHeroCopy({ category: "running" }, analysisJson, "analyse", "Wall Balls", "station");
  assert.match(result.headline, /WALL BALLS/);
  assert.match(result.headline, /BIGGEST INDIVIDUAL OPPORTUNITY/);
  assert.match(result.subline, /Running adds up to your biggest overall gap/i);
  assert.match(result.subline, /this station is the biggest one/i);
  assert.doesNotMatch(result.headline, /YOUR RUNNING GAP IS BIGGER THAN YOUR STATION GAP/i);
});
