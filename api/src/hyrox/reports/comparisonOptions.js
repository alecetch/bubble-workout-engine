import { formatPerformancePercentile } from "./copyFormatter.js";

export function comparisonOptionsArray(benchmarkContext = {}) {
  const comparisonOptions = benchmarkContext?.comparisonOptions;
  if (Array.isArray(comparisonOptions)) return comparisonOptions;
  if (Array.isArray(comparisonOptions?.options)) return comparisonOptions.options;
  return [];
}

export function primaryComparisonOption(benchmarkContext = {}) {
  return comparisonOptionsArray(benchmarkContext)[0] ?? null;
}

export function hasBenchmarkPercentileData(analysisJsonOrBenchmarkContext = {}, overallSegment = {}, athleteOverallPercentile = null) {
  if (analysisJsonOrBenchmarkContext?.analysisScope === "no_benchmark_data") return false;
  const benchmarkContext = analysisJsonOrBenchmarkContext?.benchmarkContext ?? analysisJsonOrBenchmarkContext ?? {};
  if (benchmarkContext?.available === false) return false;
  const primary = primaryComparisonOption(benchmarkContext);
  if (Number.isFinite(Number(primary?.percentile))) return true;
  if (Number.isFinite(Number(overallSegment?.fieldPercentile))) return true;
  if (Number.isFinite(Number(overallSegment?.percentile))) return true;
  if (Number.isFinite(Number(athleteOverallPercentile))) return true;
  return Boolean(benchmarkContext?.primaryBenchmarkGroup || benchmarkContext?.goalBenchmarkGroup);
}

export function worldwideTopPercentFromComparison(benchmarkContext = {}) {
  const primary = primaryComparisonOption(benchmarkContext);
  const explicitTopPercent = Number(primary?.topPercent);
  if (Number.isFinite(explicitTopPercent)) return Math.max(1, Math.round(explicitTopPercent));

  const percentile = Number(primary?.percentile);
  if (!Number.isFinite(percentile)) return null;
  return Math.max(1, Math.round(100 - percentile));
}

export function overallRankLabel(percentile) {
  return formatPerformancePercentile(percentile);
}

export function percentileTextWithFallback(benchmarkContext = {}, overallSegment = {}, athleteOverallPercentile = null) {
  const primary = primaryComparisonOption(benchmarkContext);
  const primaryPercentile = Number(primary?.percentile);
  if (Number.isFinite(primaryPercentile)) {
    const topPct = Math.max(1, Math.round(Number(primary?.topPercent ?? 100 - primaryPercentile)));
    if (primaryPercentile >= 60) return `TOP ${topPct}% WORLDWIDE`;
    return `${formatPerformancePercentile(primaryPercentile, { uppercase: true })} WORLDWIDE`;
  }

  return overallRankLabel(
    overallSegment?.fieldPercentile ??
    overallSegment?.percentile ??
    athleteOverallPercentile,
  );
}

export function benchmarkConfidenceQualifier(benchmarkContext = {}) {
  if (
    benchmarkContext?.confidenceLabel === "insufficient" ||
    benchmarkContext?.doublesBenchmarkedAsSingles === true
  ) {
    return "directional";
  }
  return null;
}
