import { RUN_KEYS, ROXZONE_KEYS, SEGMENT_MAP, STATION_KEYS } from "../config/segmentMap.js";
import { selectBenchmark } from "../confidence/benchmarkSelector.js";
import { getBenchmarkStats } from "./benchmarkService.js";
import { getSegmentLabel } from "./segmentNormaliser.js";

const SEGMENT_TYPE_BY_KEY = new Map(SEGMENT_MAP.map((segment) => [segment.segmentKey, segment.type]));
const ORDERED_METRICS = Object.freeze([
  "total_time",
  "run_time",
  "work_time",
  "roxzone_time",
  ...RUN_KEYS,
  ...STATION_KEYS,
  ...ROXZONE_KEYS,
]);

export function calculatePercentile(userSeconds, sortedBenchmarkValues) {
  if (!Number.isFinite(userSeconds) || !Array.isArray(sortedBenchmarkValues) || sortedBenchmarkValues.length === 0) return null;
  const valid = sortedBenchmarkValues.filter(Number.isFinite);
  if (valid.length === 0) return null;
  const fasterCount = valid.filter((benchmark) => benchmark > userSeconds).length;
  const pct = (fasterCount / valid.length) * 100;
  return pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
}

export function approximatePercentile(userSeconds, stats) {
  if (!Number.isFinite(userSeconds) || !stats) return null;
  if (Array.isArray(stats.sortedValues)) return calculatePercentile(userSeconds, stats.sortedValues);
  const points = [
    [stats.p10Seconds, 90],
    [stats.p25Seconds, 75],
    [stats.p50Seconds ?? stats.medianSeconds, 50],
    [stats.p75Seconds, 25],
    [stats.p90Seconds, 10],
    [stats.p95Seconds, 5],
    [stats.p99Seconds, 1],
  ].filter(([seconds]) => Number.isFinite(seconds)).sort((a, b) => a[0] - b[0]);
  if (points.length === 0) return null;
  if (userSeconds <= points[0][0]) {
    // Extrapolate beyond the fastest known point using the p10→p25 slope
    if (points.length >= 2) {
      const [a, aPct] = points[0];
      const [b, bPct] = points[1];
      const slope = (bPct - aPct) / Math.max(1, b - a);
      const raw = aPct + slope * (userSeconds - a);
      const pct = Math.min(99, Math.max(aPct, raw));
      return pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
    }
    return points[0][1];
  }
  if (userSeconds >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [aSeconds, aPct] = points[i];
    const [bSeconds, bPct] = points[i + 1];
    if (userSeconds >= aSeconds && userSeconds <= bSeconds) {
      const t = (userSeconds - aSeconds) / Math.max(1, bSeconds - aSeconds);
      const pct = aPct + (bPct - aPct) * t;
      return pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
    }
  }
  return null;
}

export function scoreTimeAgainstGroup(finishTimeSeconds, groupKey, metricKey = "total_time") {
  if (!Number.isFinite(finishTimeSeconds) || !groupKey) return null;
  const stats = getBenchmarkStats(groupKey, metricKey);
  return approximatePercentile(finishTimeSeconds, stats);
}

function segmentSeconds(normalisedSubmission, metricKey) {
  if (metricKey === "total_time") return normalisedSubmission.race?.finishTimeSeconds;
  if (metricKey === "run_time") return normalisedSubmission.runTimeSeconds;
  if (metricKey === "work_time") return normalisedSubmission.workTimeSeconds;
  if (metricKey === "roxzone_time") return normalisedSubmission.roxzoneTimeSeconds;
  return normalisedSubmission.splitMap?.get(metricKey)?.timeSeconds ?? null;
}

function segmentSecondsNetOfPenalty(normalisedSubmission, metricKey) {
  const adjusted = normalisedSubmission.penaltyAdjustedSplitMap?.get(metricKey)?.timeSeconds;
  return Number.isFinite(adjusted) ? adjusted : segmentSeconds(normalisedSubmission, metricKey);
}

function confidenceFor(stats, metricKey, normalisedSubmission, selection) {
  if (!stats || selection?.suppressed) return "low";
  if (metricKey.startsWith("roxzone_") && normalisedSubmission.roxzoneMode === "inferred_total") return "low";
  if (normalisedSubmission.splitMap?.get(metricKey)?.estimated === true) return "low";
  if (selection?.confidenceGrade === "A" || selection?.confidenceGrade === "B") return "high";
  if (selection?.confidenceGrade === "C") return "medium";
  return "low";
}

function outputTypeForMetric(metricKey, type) {
  if (metricKey === "total_time") return "overallPercentile";
  if (metricKey === "roxzone_time" || type === "roxzone") return "roxzoneEfficiency";
  if (type === "station") return "stationPercentile";
  return "stationPercentile";
}

function requestFromSubmission(normalisedSubmission, benchmarkContext) {
  const group = benchmarkContext?.primaryBenchmarkGroup ?? {};
  const request = {
    datasetVersion: group.datasetVersion,
    division: group.division ?? normalisedSubmission.athlete?.division ?? normalisedSubmission.race?.division,
    gender: group.gender ?? normalisedSubmission.athlete?.sex ?? normalisedSubmission.athlete?.gender,
    ageGroup: group.ageGroup ?? normalisedSubmission.athlete?.ageGroup ?? null,
  };
  if (group.performanceBand) {
    request.performanceBand = group.performanceBand;
  }
  return request;
}

function fallbackStatsForSuppressedBandMetric(metricKey, benchmarkContext) {
  const candidateGroupKeys = [
    benchmarkContext?.demographicBenchmarkGroup?.key,
    benchmarkContext?.totalPopulationBenchmark?.groupKey,
  ];
  const seen = new Set();

  for (const groupKey of candidateGroupKeys) {
    if (!groupKey || seen.has(groupKey)) continue;
    seen.add(groupKey);
    const stats = getBenchmarkStats(groupKey, metricKey);
    if (stats) return { groupKey, stats };
  }

  return null;
}

export function calculateSegmentStats(normalisedSubmission, benchmarkContext) {
  const primaryGroupKey = benchmarkContext?.primaryBenchmarkGroup?.key;
  const goalGroupKey = benchmarkContext?.goalBenchmarkGroup?.key;
  const demographicGroupKey = benchmarkContext?.demographicBenchmarkGroup?.key ?? null;
  // Deliberately age-agnostic: totalPopulationBenchmark is built with ageGroup "all", so this is
  // the athlete's true overall standing (division + gender only), independent of demographicGroupKey
  // above, which can be age-group-scoped. Used for the email's "OVERALL STANDING" stat.
  const totalPopulationGroupKey = benchmarkContext?.totalPopulationBenchmark?.groupKey ?? null;
  const rows = [];

  for (const metricKey of ORDERED_METRICS) {
    const userSeconds = segmentSeconds(normalisedSubmission, metricKey);
    if (!Number.isFinite(userSeconds)) continue;
    const userSecondsNetOfPenalty = segmentSecondsNetOfPenalty(normalisedSubmission, metricKey);

    const metricType = SEGMENT_TYPE_BY_KEY.get(metricKey) ?? "aggregate";
    const isBandMode = Boolean(benchmarkContext?.primaryBenchmarkGroup?.performanceBand);
    const selection = selectBenchmark(
      requestFromSubmission(normalisedSubmission, benchmarkContext),
      metricKey,
      outputTypeForMetric(metricKey, metricType),
      isBandMode ? { performanceTarget: true } : {},
    );
    let benchmarkGroupKey = selection.suppressed ? primaryGroupKey : selection.benchmarkUsed;
    let stats = getBenchmarkStats(benchmarkGroupKey, metricKey);
    let metricFallbackReason = null;
    if (selection.suppressed && isBandMode && !stats) {
      const fallback = fallbackStatsForSuppressedBandMetric(metricKey, benchmarkContext);
      if (fallback) {
        benchmarkGroupKey = fallback.groupKey;
        stats = fallback.stats;
        metricFallbackReason = "performance_band_metric_unavailable";
      }
    }
    const goalStats = goalGroupKey ? getBenchmarkStats(goalGroupKey, metricKey) : null;
    const percentile = selection.suppressed && !metricFallbackReason ? null : approximatePercentile(userSeconds, stats);
    const demographicStats = demographicGroupKey ? getBenchmarkStats(demographicGroupKey, metricKey) : null;
    const fieldPercentile = (demographicStats && (!selection.suppressed || metricFallbackReason)) ? approximatePercentile(userSeconds, demographicStats) : null;
    const totalPopulationStats = (metricKey === "total_time" && totalPopulationGroupKey) ? getBenchmarkStats(totalPopulationGroupKey, metricKey) : null;
    const overallFieldPercentile = totalPopulationStats ? approximatePercentile(userSeconds, totalPopulationStats) : null;
    const median = stats?.medianSeconds ?? stats?.p50Seconds ?? null;
    const topQuartile = stats?.p75Seconds ?? null;
    const goal = goalStats?.medianSeconds ?? goalStats?.p50Seconds ?? null;

    rows.push({
      segmentKey: metricKey,
      label: getSegmentLabel(metricKey),
      type: metricType,
      userSeconds,
      userSecondsNetOfPenalty,
      benchmarkMedianSeconds: median,
      benchmarkTopQuartileSeconds: topQuartile,
      goalBenchmarkSeconds: goal,
      percentile,
      fieldPercentile,
      overallFieldPercentile,
      timeGapToMedianSeconds: Number.isFinite(median) ? userSeconds - median : null,
      timeGapToMedianSecondsNetOfPenalty: Number.isFinite(median) && Number.isFinite(userSecondsNetOfPenalty)
        ? userSecondsNetOfPenalty - median
        : null,
      timeGapToGoalSeconds: Number.isFinite(goal) ? userSeconds - goal : Number.isFinite(median) ? userSeconds - median : null,
      rankWithinUserSegments: null,
      isBiggestLimiter: false,
      isBiggestStrength: false,
      confidence: confidenceFor(stats, metricKey, normalisedSubmission, selection),
      estimated: normalisedSubmission.splitMap?.get(metricKey)?.estimated === true,
      benchmarkGroupUsed: benchmarkGroupKey ?? null,
      benchmarkValueSeconds: median,
      benchmarkRequested: selection.benchmarkRequested ?? benchmarkContext?.primaryBenchmarkGroup?.benchmarkRequested ?? primaryGroupKey ?? null,
      fallbackLevel: selection.fallbackLevel ?? 0,
      fallbackReason: metricFallbackReason ?? selection.fallbackReason ?? null,
      confidenceScore: selection.confidenceScore ?? null,
      confidenceGrade: selection.confidenceGrade ?? null,
      confidenceAudit: selection.confidence ?? null,
      suppressed: Boolean(selection.suppressed && !metricFallbackReason),
      suppressionReason: selection.reason ?? null,
      sampleSize: stats?.sampleSize ?? 0,
    });
  }

  const ranked = [...rows]
    .filter((row) => row.type !== "aggregate" && Number.isFinite(row.timeGapToMedianSeconds))
    .sort((a, b) => b.timeGapToMedianSeconds - a.timeGapToMedianSeconds);
  ranked.forEach((row, index) => {
    const target = rows.find((candidate) => candidate.segmentKey === row.segmentKey);
    if (target) target.rankWithinUserSegments = index + 1;
  });

  return rows;
}
