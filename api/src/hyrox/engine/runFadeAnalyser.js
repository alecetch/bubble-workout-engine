import { RUN_KEYS } from "../config/segmentMap.js";
import { getBenchmarkStats } from "./benchmarkService.js";

function mean(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function medianOfSplits(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 !== 0 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function interpretFade(fadePct, benchmarkMedianFadePct) {
  if (!Number.isFinite(fadePct)) return "not_available";
  if (fadePct <= 2) return "even_pacing";
  if (fadePct <= 8) return "manageable_late_fade";
  if (Number.isFinite(benchmarkMedianFadePct) && fadePct > benchmarkMedianFadePct + 5) return "materially_above_benchmark";
  return "late_fade_present";
}

function classifyRunPattern(adjustedSplits) {
  const clean = adjustedSplits.filter(Number.isFinite);
  if (clean.length < 6) return { runPattern: "insufficient_data", strongFinish: false };
  const sorted = [...clean].sort((a, b) => a - b);
  const run8 = adjustedSplits[7];
  const strongFinish = Number.isFinite(run8) && run8 <= sorted[1];
  const earlyAvg = mean(adjustedSplits.slice(0, 3).filter(Number.isFinite));
  const lateAvg = mean(adjustedSplits.slice(5, 8).filter(Number.isFinite));
  const fadePct = earlyAvg ? ((lateAvg - earlyAvg) / earlyAvg) * 100 : null;
  if (!Number.isFinite(fadePct)) return { runPattern: "insufficient_data", strongFinish };
  if (fadePct < -2) return { runPattern: "negative_split", strongFinish };
  if (fadePct <= 2) return { runPattern: "even", strongFinish };
  return { runPattern: strongFinish ? "strong_finish" : "positive_split", strongFinish };
}

export function analyseRunFade(normalisedSubmission, benchmarkContext) {
  const activeSplitMap = normalisedSubmission.penaltyAdjustedSplitMap ?? normalisedSubmission.splitMap;
  const penaltyAffectedRuns = (normalisedSubmission.penalties ?? []).map((penalty) => ({
    ...penalty,
    rawSeconds: normalisedSubmission.splitMap?.get(penalty.runKey)?.timeSeconds ?? null,
    adjustedSeconds: activeSplitMap?.get(penalty.runKey)?.timeSeconds ?? null,
  }));
  const penaltyCorrected = normalisedSubmission.penaltyAdjustedSplitMap != null && penaltyAffectedRuns.length > 0;
  const splits = RUN_KEYS.map((key) => activeSplitMap?.get(key)?.timeSeconds);
  const present = splits.filter(Number.isFinite);
  if (present.length < 2) return { available: false, penaltyCorrected, penaltyAffectedRuns };

  const run1 = splits[0];
  const run8 = splits[7];
  if (!Number.isFinite(run1) || !Number.isFinite(run8)) return { available: false, penaltyCorrected, penaltyAffectedRuns };

  const fullCalculation = splits.every(Number.isFinite);
  const earlyAvgSeconds = fullCalculation ? mean(splits.slice(0, 3)) : run1;
  const lateAvgSeconds = fullCalculation ? mean(splits.slice(5, 8)) : run8;
  const runFadePct = earlyAvgSeconds ? ((lateAvgSeconds - earlyAvgSeconds) / earlyAvgSeconds) * 100 : null;
  const runFadeAbsolute = run8 - run1;
  const benchmarkStats = getBenchmarkStats(benchmarkContext?.primaryBenchmarkGroup?.key, "run_fade_pct");
  const benchmarkMedianFadePct = benchmarkStats?.medianSeconds ?? benchmarkStats?.p50Seconds ?? null;
  const roundedRunFadePct = Number.isFinite(runFadePct) ? Math.round(runFadePct * 10) / 10 : null;
  const medianRunSeconds = present.length >= 4 ? medianOfSplits(present) : null;
  const run1VsMedianPct = (Number.isFinite(run1) && Number.isFinite(medianRunSeconds) && medianRunSeconds > 0)
    ? Math.round(((medianRunSeconds - run1) / medianRunSeconds) * 100 * 10) / 10
    : null;
  const benchmarkRun1Stats = getBenchmarkStats(benchmarkContext?.primaryBenchmarkGroup?.key, "run_1");
  const benchmarkRun1Median = benchmarkRun1Stats?.medianSeconds ?? benchmarkRun1Stats?.p50Seconds ?? null;
  const run1VsBenchmarkMedianPct = (Number.isFinite(run1) && Number.isFinite(benchmarkRun1Median) && benchmarkRun1Median > 0)
    ? Math.round(((benchmarkRun1Median - run1) / benchmarkRun1Median) * 100 * 10) / 10
    : null;

  let run1PacingDiagnosis = "unavailable";
  if (Number.isFinite(run1VsMedianPct)) {
    if (run1VsMedianPct > 7 && Number.isFinite(roundedRunFadePct) && roundedRunFadePct >= 8) {
      run1PacingDiagnosis = "started_too_fast";
    } else if (run1VsMedianPct > 4) {
      run1PacingDiagnosis = "started_slightly_fast";
    } else {
      run1PacingDiagnosis = "appropriate";
    }
  }

  const { runPattern, strongFinish } = classifyRunPattern(splits);

  return {
    available: true,
    partialCalculation: !fullCalculation,
    earlyAvgSeconds,
    lateAvgSeconds,
    runFadePct: roundedRunFadePct,
    runFadeAbsolute,
    benchmarkMedianFadePct,
    interpretation: interpretFade(runFadePct, benchmarkMedianFadePct),
    run1Seconds: Number.isFinite(run1) ? run1 : null,
    medianRunSeconds,
    run1VsMedianPct,
    run1VsBenchmarkMedianPct,
    run1PacingDiagnosis,
    penaltyCorrected,
    penaltyAffectedRuns,
    runPattern,
    strongFinish,
  };
}
