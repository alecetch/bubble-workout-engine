import { RUN_KEYS } from "../config/segmentMap.js";
import { getBenchmarkStats } from "./benchmarkService.js";

function mean(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function interpretFade(fadePct, benchmarkMedianFadePct) {
  if (!Number.isFinite(fadePct)) return "not_available";
  if (fadePct <= 2) return "even_pacing";
  if (fadePct <= 8) return "manageable_late_fade";
  if (Number.isFinite(benchmarkMedianFadePct) && fadePct > benchmarkMedianFadePct + 5) return "materially_above_benchmark";
  return "late_fade_present";
}

export function analyseRunFade(normalisedSubmission, benchmarkContext) {
  const splits = RUN_KEYS.map((key) => normalisedSubmission.splitMap?.get(key)?.timeSeconds);
  const present = splits.filter(Number.isFinite);
  if (present.length < 2) return { available: false };

  const run1 = splits[0];
  const run8 = splits[7];
  if (!Number.isFinite(run1) || !Number.isFinite(run8)) return { available: false };

  const fullCalculation = splits.every(Number.isFinite);
  const earlyAvgSeconds = fullCalculation ? mean(splits.slice(0, 3)) : run1;
  const lateAvgSeconds = fullCalculation ? mean(splits.slice(5, 8)) : run8;
  const runFadePct = earlyAvgSeconds ? ((lateAvgSeconds - earlyAvgSeconds) / earlyAvgSeconds) * 100 : null;
  const runFadeAbsolute = run8 - run1;
  const benchmarkStats = getBenchmarkStats(benchmarkContext?.primaryBenchmarkGroup?.key, "run_fade_pct");
  const benchmarkMedianFadePct = benchmarkStats?.medianSeconds ?? benchmarkStats?.p50Seconds ?? null;

  return {
    available: true,
    partialCalculation: !fullCalculation,
    earlyAvgSeconds,
    lateAvgSeconds,
    runFadePct: Number.isFinite(runFadePct) ? Math.round(runFadePct * 10) / 10 : null,
    runFadeAbsolute,
    benchmarkMedianFadePct,
    interpretation: interpretFade(runFadePct, benchmarkMedianFadePct),
  };
}
