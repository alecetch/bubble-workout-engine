import assert from "node:assert/strict";
import test from "node:test";
import { calculateConfidence, gradeFromScore } from "../../src/hyrox/confidence/confidenceScorer.js";
import {
  makeBenchmarkGroupKey,
  buildFallbackChain,
  buildPerformanceTargetFallbackChain,
} from "../../src/hyrox/confidence/fallbackRules.js";
import { GRADE_RANK } from "../../src/hyrox/confidence/confidenceConfig.js";
import { selectBenchmark } from "../../src/hyrox/confidence/benchmarkSelector.js";
import {
  shouldShowInsight,
  shouldSoftenInsight,
  meetsPublicContentThreshold,
} from "../../src/hyrox/confidence/suppressionRules.js";
import {
  getCopyPrefix,
  getImprovementOpportunityCopy,
  getUserLabel,
} from "../../src/hyrox/confidence/confidenceLabels.js";
import { setBenchmarkData } from "../../src/hyrox/engine/benchmarkService.js";

const DATASET_VERSION = "historical_hyrox_2026_06_v1";
const BASE_REQUEST = Object.freeze({
  datasetVersion: DATASET_VERSION,
  division: "open",
  gender: "male",
  ageGroup: "35-39",
});

function group(overrides = {}) {
  const row = {
    datasetVersion: DATASET_VERSION,
    division: "open",
    gender: "male",
    ageGroup: "35-39",
    sampleSize: 1500,
    ...overrides,
  };
  return {
    ...row,
    groupKey: row.groupKey ?? makeBenchmarkGroupKey(row),
  };
}

function metric(groupKey, overrides = {}) {
  return {
    groupKey,
    metricKey: "wall_balls",
    sampleSize: 1500,
    meanSeconds: 305,
    medianSeconds: 300,
    p50Seconds: 300,
    cv: 0.12,
    missingnessRate: 0.01,
    ...overrides,
  };
}

test.beforeEach(() => {
  setBenchmarkData({ groups: [], metrics: [] });
});

// ── Section 1 – core spec scenarios ───────────────────────────────────────────

test("exact benchmark with 1500+ sample scores A or B", () => {
  const confidence = calculateConfidence(
    metric("exact"),
    { matchType: "exact" },
    BASE_REQUEST,
  );

  assert.ok(["A", "B"].includes(confidence.grade));
  assert.ok(confidence.score >= 75);
});

test("exact benchmark below absolute sample floor returns grade E", () => {
  const confidence = calculateConfidence(
    metric("exact", { sampleSize: 18 }),
    { matchType: "exact" },
    BASE_REQUEST,
  );

  assert.equal(confidence.grade, "E");
  assert.equal(confidence.score, 39);
});

test("high sample with CV over 0.30 loses at least one grade", () => {
  const candidate = { matchType: "exact" };
  const stable = calculateConfidence(metric("exact", { sampleSize: 3000, cv: 0.05 }), candidate, BASE_REQUEST);
  const noisy = calculateConfidence(metric("exact", { sampleSize: 3000, cv: 0.38 }), candidate, BASE_REQUEST);

  assert.equal(stable.grade, "A");
  assert.ok(GRADE_RANK[gradeFromScore(noisy.score)] <= GRADE_RANK[stable.grade] - 1);
  assert.equal(noisy.isNoisy, true);
});

test("confidence components sum exactly 100 when all inputs are strongest", () => {
  const confidence = calculateConfidence(
    metric("exact", { sampleSize: 3000, meanSeconds: 300, cv: 0.05, missingnessRate: 0 }),
    { matchType: "exact", performanceBand: "sub_75" },
    BASE_REQUEST,
  );
  const total = Object.values(confidence.components).reduce((sum, value) => sum + value, 0);

  assert.equal(total, 100);
  assert.equal(confidence.score, 100);
});

test("fallback selection returns audit trail fields", () => {
  const requestedKey = makeBenchmarkGroupKey(BASE_REQUEST);
  const fallbackGroup = group({ ageGroup: null, sampleSize: 300 });
  setBenchmarkData({
    groups: [fallbackGroup],
    metrics: [metric(fallbackGroup.groupKey, { sampleSize: 300, cv: 0.21 })],
  });

  const selection = selectBenchmark(BASE_REQUEST, "wall_balls", "biggestLimiter");

  assert.equal(selection.suppressed, false);
  assert.equal(selection.benchmarkRequested, requestedKey);
  assert.equal(selection.benchmarkUsed, fallbackGroup.groupKey);
  assert.equal(selection.fallbackLevel, 2);
  assert.equal(selection.fallbackReason.includes("broader benchmark"), true);
  assert.equal(selection.confidenceGrade, "C");
  assert.equal(selection.sampleSize, 300);
  assert.equal(selection.confidence.sampleSize, 300);
  assert.equal(selection.confidence.fallbackLevel, 2);
});

test("fallback chain does not cross Open and Pro divisions", () => {
  const chain = buildFallbackChain({ ...BASE_REQUEST, division: "open" });

  assert.ok(chain.length > 0);
  assert.equal(chain.some((candidate) => candidate.division === "pro"), false);
});

test("benchmark selection suppresses when no group meets sample threshold", () => {
  const exactGroup = group({ sampleSize: 18 });
  setBenchmarkData({
    groups: [exactGroup],
    metrics: [metric(exactGroup.groupKey, { sampleSize: 18 })],
  });

  const selection = selectBenchmark(BASE_REQUEST, "wall_balls", "biggestLimiter");

  assert.equal(selection.suppressed, true);
  assert.equal(selection.reason, "no_benchmark_meets_threshold");
  assert.equal(selection.attempted[0].grade, "E");
});

test("grade E suppresses insights", () => {
  assert.equal(shouldShowInsight({ outputType: "biggestLimiter", sampleSize: 1000 }, { grade: "E", sampleSize: 1000 }), false);
});

test("grade C softens insight copy", () => {
  assert.equal(shouldSoftenInsight({}, { grade: "C" }), true);
  assert.equal(getCopyPrefix("C"), "Based on available data...");
});

test("prescriptive volume increase is suppressed inside two weeks to race", () => {
  const show = shouldShowInsight(
    { outputType: "trainingRecommendation", isPrescriptive: true, suggestsVolumeIncrease: true, sampleSize: 1000 },
    { grade: "B", sampleSize: 1000 },
    { daysToRace: 10 },
  );

  assert.equal(show, false);
});

test("time potential below noise floor is suppressed", () => {
  const show = shouldShowInsight(
    { outputType: "potentialGain", timePotentialSeconds: 14, sampleSize: 1000 },
    { grade: "B", sampleSize: 1000 },
  );

  assert.equal(show, false);
});

test("A and B grades do not show confidence labels", () => {
  assert.equal(getUserLabel("A"), null);
  assert.equal(getUserLabel("B"), null);
});

test("grade C improvement copy uses approximate range instead of exact claim", () => {
  const copy = getImprovementOpportunityCopy(90, 60, 150, "C", "Wall balls");

  assert.equal(copy, "Estimated opportunity: around 1-3 minutes");
  assert.equal(copy.includes("Potential gain"), false);
});

test("grade E improvement copy is suppressed", () => {
  assert.equal(getImprovementOpportunityCopy(90, 60, 150, "E"), null);
});

test("skewed benchmark is flagged when mean and median differ materially", () => {
  const confidence = calculateConfidence(
    metric("exact", { meanSeconds: 340, medianSeconds: 300, p50Seconds: 300 }),
    { matchType: "exact" },
    BASE_REQUEST,
  );

  assert.equal(confidence.isSkewed, true);
});

// ── Section 2 – confidence score components ───────────────────────────────────

test("sample size component: each band returns correct points", () => {
  const candidate = { matchType: "exact" };
  const base = { cv: 0, missingnessRate: 0 };

  const bands = [
    [2500, 30],
    [1000, 27],
    [500,  23],
    [250,  18],
    [100,  12],
    [50,    8],
    [20,    4],
  ];

  for (const [sampleSize, expectedPoints] of bands) {
    const c = calculateConfidence({ ...base, sampleSize }, candidate, {});
    assert.equal(
      c.components.sampleSize,
      expectedPoints,
      `sampleSize ${sampleSize} expected ${expectedPoints} pts`,
    );
  }
});

test("relevance component: each matchType returns correct points", () => {
  const base = { sampleSize: 2500, cv: 0, missingnessRate: 0 };

  const cases = [
    ["exact",            25],
    ["adjacent_age_band", 21],
    ["sex_division",     17],
    ["sex_only",         12],
    ["division_only",    10],
    ["population",        5],
  ];

  for (const [matchType, expectedPoints] of cases) {
    const c = calculateConfidence(base, { matchType }, {});
    assert.equal(
      c.components.relevance,
      expectedPoints,
      `matchType '${matchType}' expected ${expectedPoints} pts`,
    );
  }
});

test("completeness component: each missingness band returns correct points", () => {
  const candidate = { matchType: "exact" };
  const base = { sampleSize: 2500, cv: 0 };

  const bands = [
    [0.01, 20],
    [0.05, 17],
    [0.15, 13],
    [0.25,  8],
    [0.35,  4],
    [0.45,  0],
  ];

  for (const [missingnessRate, expectedPoints] of bands) {
    const c = calculateConfidence({ ...base, missingnessRate }, candidate, {});
    assert.equal(
      c.components.completeness,
      expectedPoints,
      `missingnessRate ${missingnessRate} expected ${expectedPoints} pts`,
    );
  }
});

test("variance component: each CV band returns correct points", () => {
  const candidate = { matchType: "exact" };
  const base = { sampleSize: 2500, missingnessRate: 0 };

  const bands = [
    [0.09, 15],
    [0.15, 12],
    [0.25,  7],
    [0.35,  2],
    [0.45,  0],
  ];

  for (const [cv, expectedPoints] of bands) {
    const c = calculateConfidence({ ...base, cv }, candidate, {});
    assert.equal(c.components.variance, expectedPoints, `cv ${cv} expected ${expectedPoints} pts`);
  }
});

test("recency component: performanceBand present gives 10 pts, absent gives 8", () => {
  const stats = { sampleSize: 2500, cv: 0, missingnessRate: 0 };

  const withBand = calculateConfidence(stats, { matchType: "exact", performanceBand: "sub_75" }, {});
  const noBand   = calculateConfidence(stats, { matchType: "exact" }, {});

  assert.equal(withBand.components.recency, 10);
  assert.equal(noBand.components.recency, 8);
});

test("confidence score is always in range 0 to 100", () => {
  const extremeInputs = [
    [{ sampleSize: 0,    cv: 1, missingnessRate: 1 }, { matchType: "population" }],
    [{ sampleSize: 5000, cv: 0, missingnessRate: 0 }, { matchType: "exact", performanceBand: "x" }],
  ];

  for (const [stats, candidate] of extremeInputs) {
    const c = calculateConfidence(stats, candidate, {});
    assert.ok(c.score >= 0,   `score ${c.score} below 0`);
    assert.ok(c.score <= 100, `score ${c.score} above 100`);
  }
});

// ── Section 3 – grade mapping boundaries ──────────────────────────────────────

test("gradeFromScore maps score to grade at every boundary", () => {
  const cases = [
    [100, "A"],
    [ 90, "A"],
    [ 89, "B"],
    [ 75, "B"],
    [ 74, "C"],
    [ 60, "C"],
    [ 59, "D"],
    [ 40, "D"],
    [ 39, "E"],
    [  0, "E"],
  ];

  for (const [score, expectedGrade] of cases) {
    assert.equal(gradeFromScore(score), expectedGrade, `score ${score} expected grade ${expectedGrade}`);
  }
});

// ── Section 4 – fallback chain structure ──────────────────────────────────────

test("fallback chain with ageGroup starts at level 0 exact match", () => {
  const chain = buildFallbackChain(BASE_REQUEST);

  assert.ok(chain.length >= 1);
  assert.equal(chain[0].level, 0);
  assert.equal(chain[0].matchType, "exact");
  assert.equal(chain[0].ageGroup, "35-39");
});

test("fallback chain includes adjacent age band at level 1 for ageGroup 35-39", () => {
  const chain = buildFallbackChain(BASE_REQUEST);

  const level1 = chain.find((c) => c.level === 1);
  assert.ok(level1, "level 1 candidate missing");
  assert.equal(level1.matchType, "adjacent_age_band");
  assert.ok(level1.ageGroup !== null && level1.ageGroup !== "35-39");
});

test("fallback chain without ageGroup starts at sex+division with no exact or adjacent entries", () => {
  const chain = buildFallbackChain({ ...BASE_REQUEST, ageGroup: null });

  assert.ok(chain.length > 0);
  assert.equal(chain[0].matchType, "sex_division");
  assert.equal(chain.some((c) => c.matchType === "exact"), false);
  assert.equal(chain.some((c) => c.matchType === "adjacent_age_band"), false);
});

test("fallback chain always ends at population level", () => {
  const chain = buildFallbackChain(BASE_REQUEST);
  const last  = chain[chain.length - 1];

  assert.equal(last.matchType, "population");
  assert.equal(last.division, null);
  assert.equal(last.gender, null);
  assert.equal(last.ageGroup, null);
});

test("performance-target fallback chain entries all carry the performanceBand", () => {
  const requestWithBand = { ...BASE_REQUEST, performanceBand: "70_75" };
  const chain = buildPerformanceTargetFallbackChain(requestWithBand);

  assert.ok(chain.length > 0);
  assert.ok(chain.every((c) => c.performanceBand === "70_75"));
  assert.equal(chain[0].level, 0);
});

test("selectBenchmark uses performance-target chain when option is set", () => {
  const requestWithBand = { ...BASE_REQUEST, performanceBand: "70_75" };
  const bandChain = buildPerformanceTargetFallbackChain(requestWithBand);
  // Register data only at the population-level band group (level 3)
  const popBandGroup = { groupKey: bandChain[3].groupKey, sampleSize: 600, division: null, gender: null };
  setBenchmarkData({
    groups: [popBandGroup],
    metrics: [metric(popBandGroup.groupKey, { sampleSize: 600, cv: 0.15, missingnessRate: 0.05 })],
  });

  const selection = selectBenchmark(requestWithBand, "wall_balls", "overallPercentile", { performanceTarget: true });

  assert.equal(selection.suppressed, false);
  assert.ok(selection.benchmarkUsed.includes("band"));
});

// ── Section 5 – hard-stop conditions ──────────────────────────────────────────

test("non-individual division produces empty fallback chain", () => {
  const chain = buildFallbackChain({ ...BASE_REQUEST, division: "relay" });

  assert.equal(chain.length, 0);
});

test("selectBenchmark suppresses for non-individual division", () => {
  const selection = selectBenchmark({ ...BASE_REQUEST, division: "relay" }, "wall_balls", "overallPercentile");

  assert.equal(selection.suppressed, true);
  assert.equal(selection.reason, "no_benchmark_meets_threshold");
});

test("doubles division is individual and produces a valid fallback chain", () => {
  const chain = buildFallbackChain({ ...BASE_REQUEST, division: "doubles" });

  assert.ok(chain.length > 0);
  assert.equal(chain[0].division, "doubles");
});

test("pro division is individual and produces a valid fallback chain", () => {
  const chain = buildFallbackChain({ ...BASE_REQUEST, division: "pro" });

  assert.ok(chain.length > 0);
  assert.ok(chain.every((c) => c.division === "pro" || c.division === null));
});

// ── Section 6 – minimum sample sizes by output type ───────────────────────────

test("shouldShowInsight enforces minimum sample for top10PctClaim", () => {
  const conf = { grade: "A" };

  assert.equal(shouldShowInsight({ outputType: "top10PctClaim", sampleSize: 499 }, { ...conf, sampleSize: 499 }), false);
  assert.equal(shouldShowInsight({ outputType: "top10PctClaim", sampleSize: 500 }, { ...conf, sampleSize: 500 }), true);
});

test("shouldShowInsight enforces minimum sample for biggestLimiter", () => {
  const conf = { grade: "B" };

  assert.equal(shouldShowInsight({ outputType: "biggestLimiter", sampleSize: 249 }, { ...conf, sampleSize: 249 }), false);
  assert.equal(shouldShowInsight({ outputType: "biggestLimiter", sampleSize: 250 }, { ...conf, sampleSize: 250 }), true);
});

test("shouldShowInsight enforces minimum sample for top1PctClaim", () => {
  const conf = { grade: "A" };

  assert.equal(shouldShowInsight({ outputType: "top1PctClaim", sampleSize: 2499 }, { ...conf, sampleSize: 2499 }), false);
  assert.equal(shouldShowInsight({ outputType: "top1PctClaim", sampleSize: 2500 }, { ...conf, sampleSize: 2500 }), true);
});

test("selectBenchmark suppresses when sample falls below trainingRecommendation minimum of 500", () => {
  const thinGroup = group({ ageGroup: null, sampleSize: 499 });
  setBenchmarkData({
    groups: [thinGroup],
    metrics: [metric(thinGroup.groupKey, { sampleSize: 499, cv: 0.1, missingnessRate: 0.01 })],
  });

  const selection = selectBenchmark(BASE_REQUEST, "wall_balls", "trainingRecommendation");

  assert.equal(selection.suppressed, true);
});

// ── Section 7 – insight type grade requirements ───────────────────────────────

test("predictive insight is suppressed when confidence grade is below B", () => {
  const gradeC = shouldShowInsight(
    { outputType: "potentialGain", isPredictive: true, sampleSize: 1000, timePotentialSeconds: 60 },
    { grade: "C", sampleSize: 1000 },
  );
  const gradeB = shouldShowInsight(
    { outputType: "potentialGain", isPredictive: true, sampleSize: 1000, timePotentialSeconds: 60 },
    { grade: "B", sampleSize: 1000 },
  );

  assert.equal(gradeC, false);
  assert.equal(gradeB, true);
});

test("non-predictive grade D insight is shown", () => {
  const show = shouldShowInsight(
    { outputType: "overallPercentile", sampleSize: 200 },
    { grade: "D", sampleSize: 200 },
  );

  assert.equal(show, true);
});

test("selectBenchmark enforces grade B threshold for trainingRecommendation output type", () => {
  // Grade C group (300 samples, moderate stats) — would satisfy biggestLimiter but not trainingRecommendation
  const gradeCGroup = group({ ageGroup: null, sampleSize: 300 });
  setBenchmarkData({
    groups: [gradeCGroup],
    metrics: [metric(gradeCGroup.groupKey, { sampleSize: 300, cv: 0.21, missingnessRate: 0.05 })],
  });

  const selection = selectBenchmark(BASE_REQUEST, "wall_balls", "trainingRecommendation");

  assert.equal(selection.suppressed, true);
});

// ── Section 8 – suppression rules (additional) ────────────────────────────────

test("data quality score below 70 suppresses insight regardless of grade", () => {
  assert.equal(
    shouldShowInsight(
      { outputType: "overallPercentile", sampleSize: 500 },
      { grade: "A", sampleSize: 500 },
      { dataQualityScore: 69 },
    ),
    false,
  );
});

test("data quality score of exactly 70 does not suppress insight", () => {
  assert.equal(
    shouldShowInsight(
      { outputType: "overallPercentile", sampleSize: 500 },
      { grade: "A", sampleSize: 500 },
      { dataQualityScore: 70 },
    ),
    true,
  );
});

test("prescriptive volume increase is allowed when daysToRace is exactly 14", () => {
  const show = shouldShowInsight(
    { outputType: "trainingRecommendation", isPrescriptive: true, suggestsVolumeIncrease: true, sampleSize: 1000 },
    { grade: "B", sampleSize: 1000 },
    { daysToRace: 14 },
  );

  assert.equal(show, true);
});

test("time potential at exactly 15 seconds is shown", () => {
  const show = shouldShowInsight(
    { outputType: "potentialGain", timePotentialSeconds: 15, sampleSize: 1000 },
    { grade: "B", sampleSize: 1000 },
  );

  assert.equal(show, true);
});

// ── Section 9 – soften rules ──────────────────────────────────────────────────

test("grade A with fallbackLevel 0 is not softened", () => {
  assert.equal(shouldSoftenInsight({}, { grade: "A", fallbackLevel: 0 }), false);
});

test("grade A with fallbackLevel 1 is not softened", () => {
  assert.equal(shouldSoftenInsight({}, { grade: "A", fallbackLevel: 1 }), false);
});

test("grade A with fallbackLevel 2 is softened", () => {
  assert.equal(shouldSoftenInsight({}, { grade: "A", fallbackLevel: 2 }), true);
});

test("grade D softens insight regardless of other fields", () => {
  assert.equal(shouldSoftenInsight({}, { grade: "D" }), true);
});

test("inferred roxzone with unallocated time above 1200s triggers soften", () => {
  assert.equal(
    shouldSoftenInsight({ usesInferredRoxzone: true, unallocatedTimeSeconds: 1201 }, { grade: "A" }),
    true,
  );
});

test("inferred roxzone with unallocated time at exactly 1200s does not trigger soften", () => {
  assert.equal(
    shouldSoftenInsight({ usesInferredRoxzone: true, unallocatedTimeSeconds: 1200 }, { grade: "A" }),
    false,
  );
});

test("ageGroupMissing flag softens insight", () => {
  assert.equal(shouldSoftenInsight({ ageGroupMissing: true }, { grade: "A" }), true);
});

test("grade B with no special conditions is not softened", () => {
  assert.equal(shouldSoftenInsight({}, { grade: "B", fallbackLevel: 0 }), false);
});

// ── Section 10 – user-facing copy prefixes ────────────────────────────────────

test("getCopyPrefix returns empty string for grade A", () => {
  assert.equal(getCopyPrefix("A"), "");
});

test("getCopyPrefix returns hedged language for grade B", () => {
  assert.ok(getCopyPrefix("B").length > 0);
});

test("getCopyPrefix returns approximate language for grade C", () => {
  assert.ok(getCopyPrefix("C").length > 0);
  assert.ok(getCopyPrefix("C").toLowerCase().includes("available data") || getCopyPrefix("C").toLowerCase().includes("approximately"));
});

test("getCopyPrefix returns limited-data language for grade D", () => {
  assert.ok(getCopyPrefix("D").length > 0);
  assert.ok(getCopyPrefix("D").toLowerCase().includes("limited"));
});

test("copy output does not contain forbidden certainty phrases", () => {
  const forbidden = ["You will save exactly", "This proves", "Guaranteed improvement"];
  const gradesToCheck = ["A", "B", "C", "D"];

  for (const grade of gradesToCheck) {
    const prefix = getCopyPrefix(grade) ?? "";
    const improvementCopy = getImprovementOpportunityCopy(90, 60, 150, grade, "Wall Balls") ?? "";
    const combined = prefix + " " + improvementCopy;

    for (const phrase of forbidden) {
      assert.equal(combined.includes(phrase), false, `Grade ${grade} output contains forbidden phrase: "${phrase}"`);
    }
  }
});

// ── Section 11 – improvement opportunity format ───────────────────────────────

test("grade A improvement copy shows single point estimate without range language", () => {
  const copy = getImprovementOpportunityCopy(90, 45, 135, "A");

  assert.ok(copy !== null);
  assert.ok(copy.includes("Potential gain"));
  assert.equal(copy.includes("around"), false);
});

test("grade B improvement copy shows single point estimate", () => {
  const copy = getImprovementOpportunityCopy(78, 45, 105, "B");

  assert.ok(copy !== null);
  assert.ok(copy.includes("Potential gain"));
});

test("grade D improvement copy names the station and flags limited confidence", () => {
  const copy = getImprovementOpportunityCopy(90, 45, 135, "D", "Ski Erg");

  assert.ok(copy !== null);
  assert.ok(copy.toLowerCase().includes("opportunity"));
  assert.ok(copy.toLowerCase().includes("limited"));
});

test("grade C improvement copy uses range not single figure", () => {
  const copy = getImprovementOpportunityCopy(90, 60, 150, "C");

  assert.ok(copy !== null);
  assert.ok(copy.includes("around"));
  assert.equal(copy.includes("Potential gain"), false);
});

// ── Section 13 – skew rule boundary ──────────────────────────────────────────

test("benchmark not flagged as skewed when gap is exactly 10 percent", () => {
  // |374 - 340| / 340 = 34/340 = 0.10 exactly — rule is > 10%, so this should not trigger
  const confidence = calculateConfidence(
    metric("exact", { meanSeconds: 374, medianSeconds: 340, p50Seconds: 340 }),
    { matchType: "exact" },
    BASE_REQUEST,
  );

  assert.equal(confidence.isSkewed, false);
});

test("benchmark is flagged as skewed when gap is just over 10 percent", () => {
  // |375 - 340| / 340 ≈ 10.3%
  const confidence = calculateConfidence(
    metric("exact", { meanSeconds: 375, medianSeconds: 340, p50Seconds: 340 }),
    { matchType: "exact" },
    BASE_REQUEST,
  );

  assert.equal(confidence.isSkewed, true);
});

test("benchmark is not skewed when mean and median are close", () => {
  const confidence = calculateConfidence(
    metric("exact", { meanSeconds: 302, medianSeconds: 300, p50Seconds: 300 }),
    { matchType: "exact" },
    BASE_REQUEST,
  );

  assert.equal(confidence.isSkewed, false);
});

// ── Section 14 – public content confidence ────────────────────────────────────

test("broad population claim requires grade A", () => {
  assert.equal(meetsPublicContentThreshold("broad_population", "A", 10000).show, true);
  assert.equal(meetsPublicContentThreshold("broad_population", "B", 10000).show, false);
});

test("sex-specific claim allows grade A unconditionally or grade B with large sample", () => {
  assert.equal(meetsPublicContentThreshold("sex_specific", "A", 1000).show, true);
  assert.equal(meetsPublicContentThreshold("sex_specific", "B", 5000).show, true);
  assert.equal(meetsPublicContentThreshold("sex_specific", "B", 4999).show, false);
  assert.equal(meetsPublicContentThreshold("sex_specific", "C", 5000).show, false);
});

test("age-group claim requires grade B", () => {
  assert.equal(meetsPublicContentThreshold("age_group", "B", 500).show, true);
  assert.equal(meetsPublicContentThreshold("age_group", "C", 500).show, false);
});

test("division-specific claim requires grade B", () => {
  assert.equal(meetsPublicContentThreshold("division_specific", "B", 500).show, true);
  assert.equal(meetsPublicContentThreshold("division_specific", "C", 500).show, false);
});

test("niche subgroup at grade C is shown with caveat required", () => {
  const result = meetsPublicContentThreshold("niche_subgroup", "C", 100);

  assert.equal(result.show, true);
  assert.equal(result.requiresCaveat, true);
});

test("niche subgroup at grade D is suppressed", () => {
  const result = meetsPublicContentThreshold("niche_subgroup", "D", 100);

  assert.equal(result.show, false);
  assert.equal(result.requiresCaveat, false);
});

// ── Section 16 – edge cases ───────────────────────────────────────────────────

test("sampleSize 0 yields 0 sample component points and grade E", () => {
  const c = calculateConfidence({ sampleSize: 0, cv: 0, missingnessRate: 0 }, { matchType: "exact" }, {});

  assert.equal(c.components.sampleSize, 0);
  assert.equal(c.grade, "E");
});

test("sampleSize 20 yields 4 sample component points (band boundary)", () => {
  const c = calculateConfidence({ sampleSize: 20, cv: 0, missingnessRate: 0 }, { matchType: "exact" }, {});

  assert.equal(c.components.sampleSize, 4);
});

test("sampleSize 19 yields 0 sample component points and is capped to grade E", () => {
  const c = calculateConfidence({ sampleSize: 19, cv: 0, missingnessRate: 0 }, { matchType: "exact" }, {});

  assert.equal(c.components.sampleSize, 0);
  assert.equal(c.grade, "E");
});

test("cv of 0 yields maximum variance component points", () => {
  const c = calculateConfidence({ sampleSize: 2500, cv: 0, missingnessRate: 0 }, { matchType: "exact" }, {});

  assert.equal(c.components.variance, 15);
});

test("missingness at exactly 0.40 yields 4 completeness points (31-40% band)", () => {
  const c = calculateConfidence({ sampleSize: 2500, cv: 0, missingnessRate: 0.40 }, { matchType: "exact" }, {});

  assert.equal(c.components.completeness, 4);
});

test("missingness just over 0.40 yields 0 completeness points", () => {
  const c = calculateConfidence({ sampleSize: 2500, cv: 0, missingnessRate: 0.41 }, { matchType: "exact" }, {});

  assert.equal(c.components.completeness, 0);
});

test("selectBenchmark returns suppressed with attempted list when all metrics are missing", () => {
  const exactGroup = group();
  setBenchmarkData({
    groups: [exactGroup],
    metrics: [], // no metric data registered
  });

  const selection = selectBenchmark(BASE_REQUEST, "wall_balls", "overallPercentile");

  assert.equal(selection.suppressed, true);
  assert.ok(Array.isArray(selection.attempted));
});

test("isNoisy flag is false when CV is below noisy threshold", () => {
  const c = calculateConfidence(
    { sampleSize: 2500, cv: 0.29, missingnessRate: 0 },
    { matchType: "exact" },
    {},
  );

  assert.equal(c.isNoisy, false);
});

test("isNoisy flag is true when CV is exactly at noisy threshold boundary", () => {
  // threshold is 0.30; > 0.30 triggers noisy
  const atThreshold    = calculateConfidence({ sampleSize: 2500, cv: 0.30, missingnessRate: 0 }, { matchType: "exact" }, {});
  const aboveThreshold = calculateConfidence({ sampleSize: 2500, cv: 0.31, missingnessRate: 0 }, { matchType: "exact" }, {});

  assert.equal(atThreshold.isNoisy, false);
  assert.equal(aboveThreshold.isNoisy, true);
});
