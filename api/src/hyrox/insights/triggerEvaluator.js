import { STATION_KEYS } from "../config/segmentMap.js";

function number(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function primaryGroup(analysisJson = {}) {
  return analysisJson.benchmarkContext?.primaryBenchmarkGroup ?? {};
}

function benchmarkEvidence(analysisJson = {}) {
  const group = primaryGroup(analysisJson);
  return {
    benchmarkGroup: group.label ?? group.key ?? "your benchmark group",
    sampleSize: group.sampleSize ?? 0,
    confidenceGrade: group.confidenceGrade ?? group.confidence?.grade ?? "D",
    fallbackLevel: group.fallbackLevel ?? group.confidence?.fallbackLevel ?? 0,
  };
}

function limiterFrom(analysisJson = {}) {
  return analysisJson.limiters?.[0] ?? analysisJson.headline?.biggestLimiter ?? null;
}

function strengthFrom(analysisJson = {}) {
  return analysisJson.strengths?.[0] ?? analysisJson.headline?.biggestStrength ?? null;
}

function segmentByKey(analysisJson = {}, segmentKey) {
  if (!segmentKey) return null;
  return analysisJson.segments?.find((segment) => segment.segmentKey === segmentKey) ?? null;
}

function baseSegmentEvidence(analysisJson, segment) {
  const benchmark = benchmarkEvidence(analysisJson);
  return {
    ...benchmark,
    segmentKey: segment?.segmentKey ?? null,
    segmentLabel: segment?.label ?? null,
    percentile: number(segment?.percentile),
    confidenceGrade: segment?.confidenceGrade ?? benchmark.confidenceGrade,
    fallbackLevel: segment?.fallbackLevel ?? benchmark.fallbackLevel,
    sampleSize: segment?.sampleSize ?? benchmark.sampleSize,
    evidenceType: (segment?.fallbackLevel ?? benchmark.fallbackLevel ?? 0) > 0 ? "direct_fallback" : "direct_precise",
  };
}

function raceFinishSeconds(analysisJson = {}, athleteContext = {}) {
  return number(
    analysisJson.race?.finishTimeSeconds
      ?? analysisJson.finishTimeSeconds
      ?? analysisJson.result?.finishTimeSeconds
      ?? athleteContext.finishTimeSeconds,
  );
}

function hasContext(athleteContext) {
  return athleteContext && Object.keys(athleteContext).length > 0;
}

function contextHasEngineSignal(analysisJson = {}, athleteContext = {}) {
  return Number.isFinite(number(athleteContext.fiveKSeconds))
    || Number.isFinite(number(athleteContext.fiveKPbSeconds))
    || Number.isFinite(number(athleteContext.engineScore))
    || Number.isFinite(number(analysisJson.scores?.engineScore));
}

function contextHasStrengthSignal(athleteContext = {}) {
  return Boolean(athleteContext.strengthBenchmarks)
    || Number.isFinite(number(athleteContext.squatKg))
    || Number.isFinite(number(athleteContext.deadliftKg))
    || Number.isFinite(number(athleteContext.strengthScore));
}

const triggerHandlers = {
  BIGGEST_LIMITER_EXISTS(def, analysisJson) {
    const limiter = limiterFrom(analysisJson);
    const gap = number(limiter?.timeGapSeconds ?? limiter?.timeGapToMedianSeconds, 0);
    if (!limiter || gap < (def.minPotentialGainSeconds ?? 30)) return null;
    const segment = segmentByKey(analysisJson, limiter.segmentKey) ?? limiter;
    return {
      ...baseSegmentEvidence(analysisJson, segment),
      primaryMetric: "potential_gain_seconds",
      primaryValue: gap,
      potentialGainSeconds: gap,
      percentile: number(limiter.percentile ?? segment?.percentile),
      coreClaim: "biggest_limiter",
    };
  },

  BIGGEST_STRENGTH_EXISTS(def, analysisJson) {
    const strength = strengthFrom(analysisJson);
    if (!strength || number(strength.percentile, 0) < 75) return null;
    const segment = segmentByKey(analysisJson, strength.segmentKey) ?? strength;
    return {
      ...baseSegmentEvidence(analysisJson, segment),
      primaryMetric: "station_percentile",
      primaryValue: number(strength.percentile),
      percentile: number(strength.percentile),
      coreClaim: "biggest_strength",
    };
  },

  TIME_POTENTIAL_EXISTS(def, analysisJson) {
    const gain = number(analysisJson.timePotential?.headlineGainSeconds ?? analysisJson.headline?.headlineGainSeconds, 0);
    if (gain < (def.minPotentialGainSeconds ?? 45)) return null;
    const limiter = limiterFrom(analysisJson);
    const segment = segmentByKey(analysisJson, limiter?.segmentKey) ?? limiter;
    return {
      ...baseSegmentEvidence(analysisJson, segment),
      primaryMetric: "potential_gain_seconds",
      primaryValue: gain,
      potentialGainSeconds: gain,
      projectedTimeSeconds: number(analysisJson.timePotential?.newProjectedTimeSeconds ?? analysisJson.headline?.projectedTimeSeconds),
      coreClaim: "time_potential",
    };
  },

  OVERALL_PERCENTILE_VALID(def, analysisJson) {
    const total = segmentByKey(analysisJson, "total_time");
    const benchmark = benchmarkEvidence(analysisJson);
    if (!total || !Number.isFinite(number(total.percentile)) || benchmark.sampleSize < 100) return null;
    return {
      ...baseSegmentEvidence(analysisJson, total),
      primaryMetric: "overall_percentile",
      primaryValue: number(total.percentile),
      percentile: number(total.percentile),
      sampleSize: total.sampleSize ?? benchmark.sampleSize,
      coreClaim: "overall_percentile",
    };
  },

  GOAL_GAP_POSITIVE(def, analysisJson, athleteContext) {
    const target = number(athleteContext.targetFinishTimeSeconds ?? athleteContext.targetTimeSeconds);
    const finish = raceFinishSeconds(analysisJson, athleteContext);
    if (!Number.isFinite(target) || !Number.isFinite(finish) || finish <= target) return null;
    return {
      ...benchmarkEvidence(analysisJson),
      primaryMetric: "goal_gap_seconds",
      primaryValue: Math.round(finish - target),
      potentialGainSeconds: Math.round(finish - target),
      targetFinishTimeSeconds: target,
      finishTimeSeconds: finish,
      evidenceType: "derived",
      confidenceGrade: "D",
      coreClaim: "goal_gap",
    };
  },

  GOAL_GAP_ACHIEVED(def, analysisJson, athleteContext) {
    const target = number(athleteContext.targetFinishTimeSeconds ?? athleteContext.targetTimeSeconds);
    const finish = raceFinishSeconds(analysisJson, athleteContext);
    if (!Number.isFinite(target) || !Number.isFinite(finish) || finish > target) return null;
    return {
      ...benchmarkEvidence(analysisJson),
      primaryMetric: "goal_margin_seconds",
      primaryValue: Math.round(target - finish),
      targetFinishTimeSeconds: target,
      finishTimeSeconds: finish,
      evidenceType: "derived",
      confidenceGrade: "D",
      coreClaim: "goal_achieved",
    };
  },

  WORK_RUN_IMBALANCE(def, analysisJson) {
    const engine = number(analysisJson.scores?.engineScore);
    const strength = number(analysisJson.scores?.strengthScore);
    const profile = analysisJson.workRunBalance?.profileType;
    const scoreGap = Number.isFinite(engine) && Number.isFinite(strength) ? Math.abs(engine - strength) : 0;
    if (scoreGap <= 20 && !["runner_dominant", "strength_dominant"].includes(profile)) return null;
    return {
      ...benchmarkEvidence(analysisJson),
      primaryMetric: "engine_strength_score_gap",
      primaryValue: scoreGap,
      profileType: profile ?? "imbalanced",
      evidenceType: "derived",
      confidenceGrade: "D",
      coreClaim: "work_run_balance",
    };
  },

  RUN_FADE_HIGH(def, analysisJson) {
    const fade = number(analysisJson.runningAnalysis?.runFadePct, 0);
    if (fade < 8) return null;
    return {
      ...benchmarkEvidence(analysisJson),
      primaryMetric: "run_fade_pct",
      primaryValue: fade,
      runFadePct: fade,
      potentialGainSeconds: 0,
      evidenceType: "derived",
      confidenceGrade: analysisJson.runningAnalysis?.confidenceGrade ?? "C",
      coreClaim: "run_fade",
    };
  },

  ROXZONE_INEFFICIENT(def, analysisJson) {
    const rox = analysisJson.roxzoneAnalysis ?? {};
    const percentile = number(rox.percentile);
    const gap = number(rox.timeGapToMedianSeconds, 0);
    if (!((Number.isFinite(percentile) && percentile < 40) || gap >= 30)) return null;
    return {
      ...benchmarkEvidence(analysisJson),
      segmentKey: "roxzone_time",
      segmentLabel: "Roxzone",
      primaryMetric: "roxzone_time_gap_to_median",
      primaryValue: Math.max(0, gap),
      potentialGainSeconds: Math.max(0, gap),
      percentile,
      evidenceType: rox.mode === "inferred_total" ? "context_inference" : "derived",
      confidenceGrade: rox.confidenceGrade ?? "C",
      coreClaim: "roxzone_efficiency",
    };
  },

  ROXZONE_STRONG(def, analysisJson) {
    const rox = analysisJson.roxzoneAnalysis ?? {};
    const percentile = number(rox.percentile);
    if (!Number.isFinite(percentile) || percentile < 80) return null;
    return {
      ...benchmarkEvidence(analysisJson),
      segmentKey: "roxzone_time",
      segmentLabel: "Roxzone",
      primaryMetric: "roxzone_percentile",
      primaryValue: percentile,
      percentile,
      evidenceType: rox.mode === "inferred_total" ? "context_inference" : "derived",
      confidenceGrade: rox.confidenceGrade ?? "D",
      coreClaim: "roxzone_strength",
    };
  },

  STATION_CONTRAST_HIGH(def, analysisJson) {
    const stations = (analysisJson.segments ?? [])
      .filter((segment) => segment.type === "station" || STATION_KEYS.includes(segment.segmentKey))
      .filter((segment) => Number.isFinite(number(segment.percentile)));
    if (stations.length < 2) return null;
    const sorted = [...stations].sort((a, b) => a.percentile - b.percentile);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    const gap = Math.round(best.percentile - worst.percentile);
    if (gap < 40) return null;
    return {
      ...baseSegmentEvidence(analysisJson, worst),
      primaryMetric: "station_percentile_gap",
      primaryValue: gap,
      percentileGap: gap,
      bestSegmentKey: best.segmentKey,
      bestSegmentLabel: best.label,
      worstSegmentKey: worst.segmentKey,
      worstSegmentLabel: worst.label,
      coreClaim: "station_contrast",
    };
  },

  ARCHETYPE_RUNNER_STATION_LIMITED(def, analysisJson, athleteContext) {
    const limiter = limiterFrom(analysisJson);
    const engine = number(athleteContext.engineScore ?? analysisJson.scores?.engineScore, 0);
    const archetypeMatch = analysisJson.athleteArchetype?.key === "strong_runner_station_limited";
    const syntheticMatch = engine >= 65 && limiter?.type === "station";
    if (!hasContext(athleteContext) || !contextHasEngineSignal(analysisJson, athleteContext) || !(archetypeMatch || syntheticMatch)) return null;
    return {
      ...baseSegmentEvidence(analysisJson, segmentByKey(analysisJson, limiter.segmentKey) ?? limiter),
      primaryMetric: "engine_score",
      primaryValue: engine,
      potentialGainSeconds: number(limiter.timeGapSeconds, 0),
      evidenceType: "context_inference",
      confidenceGrade: "C",
      coreClaim: "runner_station_archetype",
    };
  },

  ARCHETYPE_LIFTER_RUN_LIMITED(def, analysisJson, athleteContext) {
    const engine = number(analysisJson.scores?.engineScore, 100);
    const archetypeMatch = analysisJson.athleteArchetype?.key === "strong_lifter_engine_limited";
    if (!hasContext(athleteContext) || !contextHasStrengthSignal(athleteContext) || !(archetypeMatch || engine < 55)) return null;
    return {
      ...benchmarkEvidence(analysisJson),
      primaryMetric: "engine_score",
      primaryValue: engine,
      evidenceType: "context_inference",
      confidenceGrade: "C",
      coreClaim: "lifter_engine_archetype",
    };
  },

  POPULATION_WALL_BALLS_NOT_SLED(def, analysisJson, athleteContext) {
    const rankings = athleteContext.populationGapRankings ?? analysisJson.populationGapRankings;
    if (!rankings) return null;
    const wallRank = number(rankings.wall_balls?.rank ?? rankings.wall_balls);
    const pushRank = number(rankings.sled_push?.rank ?? rankings.sled_push, 99);
    const pullRank = number(rankings.sled_pull?.rank ?? rankings.sled_pull, 99);
    if (!(wallRank <= 2 && pushRank > 2 && pullRank > 2)) return null;
    return {
      ...benchmarkEvidence(analysisJson),
      segmentKey: "wall_balls",
      segmentLabel: "Wall Balls",
      primaryMetric: "population_gap_rank",
      primaryValue: wallRank,
      wallBallGapRank: wallRank,
      stationGapRankings: rankings,
      evidenceType: "population",
      confidenceGrade: "A",
      coreClaim: "population_wall_balls_not_sled",
    };
  },

  MISSING_REQUIRED_SPLITS(def, analysisJson) {
    const completeness = analysisJson.dataQuality?.inputCompleteness;
    const complete = completeness === "complete" || completeness === 1 || completeness === undefined;
    if (complete && !analysisJson.dataQuality?.warnings?.includes("partial_split_data")) return null;
    return {
      ...benchmarkEvidence(analysisJson),
      primaryMetric: "input_completeness",
      primaryValue: Number.isFinite(number(completeness)) ? completeness : 0,
      missingFields: analysisJson.dataQuality?.issues ?? analysisJson.dataQuality?.warnings ?? [],
      evidenceType: "data_quality",
      confidenceGrade: "D",
      coreClaim: "missing_required_splits",
    };
  },
};

export function evaluateTrigger(insightDef, analysisJson = {}, athleteContext = {}) {
  if (!insightDef?.enabled) return { eligible: false, evidenceValues: {} };
  if (insightDef.requiresContext && !hasContext(athleteContext)) {
    return { eligible: false, evidenceValues: {} };
  }
  const handler = triggerHandlers[insightDef.triggerKey];
  if (!handler) return { eligible: false, evidenceValues: {} };
  const evidenceValues = handler(insightDef, analysisJson, athleteContext);
  return {
    eligible: Boolean(evidenceValues),
    evidenceValues: evidenceValues ?? {},
  };
}
