import { BENCHMARK_THRESHOLDS } from "../config/benchmarkThresholds.js";
import { resolvedStatGapSeconds } from "./gapSelectors.js";

function result(key, label, confidence, evidence) {
  return { key, label, confidence, evidence };
}

function segment(segmentStats, key) {
  return segmentStats.find((row) => row.segmentKey === key);
}

export function classifyArchetype(scores, normalisedSubmission, runFadeAnalysis, roxzoneAnalysis = null, limiter = null, segmentStats = []) {
  const engine = scores.engineScore;
  const strength = scores.strengthScore;
  const execution = scores.executionScore;
  const previousRaces = Number(normalisedSubmission.athleteContext?.previousHyroxRaces ?? 0);
  const wallBalls = segment(segmentStats, "wall_balls");
  const stationGaps = segmentStats.filter((row) => row.type === "station" && Number.isFinite(resolvedStatGapSeconds(row)));

  if (Number.isFinite(engine) && engine >= 65 && Number.isFinite(strength) && strength < 55) {
    return result("strong_runner_station_limited", "Strong runner, station limited", "high", [`Engine score ${engine}`, `Strength score ${strength}`]);
  }
  if (Number.isFinite(strength) && strength >= 65 && Number.isFinite(engine) && engine < 55) {
    return result("strong_lifter_engine_limited", "Strong lifter, engine limited", "high", [`Strength score ${strength}`, `Engine score ${engine}`]);
  }
  if (Number.isFinite(engine) && Number.isFinite(strength) && Math.abs(engine - strength) < 15 && Number.isFinite(execution) && execution < 45) {
    return result("balanced_transition_limited", "Balanced but transition limited", "medium", [`Engine/strength gap ${Math.abs(engine - strength)}`, `Execution score ${execution}`]);
  }
  if (runFadeAnalysis?.available && runFadeAnalysis.runFadePct > 10 && runFadeAnalysis.interpretation === "materially_above_benchmark") {
    return result("late_fade_athlete", "Late fade athlete", "medium", [`Run fade ${runFadeAnalysis.runFadePct}%`, "Above benchmark fade"]);
  }
  if (limiter?.segmentKey === "wall_balls" && limiter.timeGapSeconds > BENCHMARK_THRESHOLDS.wallBallBottleneckGapSeconds) {
    return result("wall_ball_bottleneck", "Wall ball bottleneck", "high", [`Wall balls gap ${limiter.timeGapSeconds}s`, "Primary limiter"]);
  }
  if (previousRaces === 0 && (roxzoneAnalysis?.percentile ?? 100) < 40) {
    return result("first_timer_execution_leak", "First-timer execution leak", "medium", [`Roxzone percentile ${roxzoneAnalysis?.percentile}`, "No previous HYROX races"]);
  }
  if (
    (scores.overallPerformanceScore ?? 0) > BENCHMARK_THRESHOLDS.eliteOverallPercentile &&
    stationGaps.every((row) => resolvedStatGapSeconds(row) < BENCHMARK_THRESHOLDS.eliteMaxStationGapSeconds)
  ) {
    return result("elite_marginal_gains", "Advanced marginal gains", "medium", [`Overall score ${scores.overallPerformanceScore}`, "All station gaps under 30s"]);
  }
  if (Number.isFinite(engine) && Number.isFinite(strength) && Math.abs(engine - strength) < 15 && (execution ?? 100) >= 45) {
    return result("balanced_hybrid", "Balanced hybrid", "medium", [`Engine score ${engine}`, `Strength score ${strength}`]);
  }
  const wallBallsGap = resolvedStatGapSeconds(wallBalls);
  if (wallBallsGap > BENCHMARK_THRESHOLDS.wallBallBottleneckGapSeconds) {
    return result("wall_ball_bottleneck", "Wall ball bottleneck", "medium", [`Wall balls gap ${Math.round(wallBallsGap)}s`]);
  }
  return result("balanced_hybrid", "Balanced hybrid", "low", ["No dominant limiter pattern"]);
}
