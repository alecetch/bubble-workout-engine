export function comparisonOptionsArray(benchmarkContext = {}) {
  const comparisonOptions = benchmarkContext?.comparisonOptions;
  if (Array.isArray(comparisonOptions)) return comparisonOptions;
  if (Array.isArray(comparisonOptions?.options)) return comparisonOptions.options;
  return [];
}

export function primaryComparisonOption(benchmarkContext = {}) {
  return comparisonOptionsArray(benchmarkContext)[0] ?? null;
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
  const n = Number(percentile);
  if (!Number.isFinite(n)) return null;
  const topPct = Math.max(1, Math.round(100 - n));
  return `Top ${topPct}%`;
}

export function percentileTextWithFallback(benchmarkContext = {}, overallSegment = {}, athleteOverallPercentile = null) {
  const worldwideTopPercent = worldwideTopPercentFromComparison(benchmarkContext);
  if (worldwideTopPercent != null) return `TOP ${worldwideTopPercent}% WORLDWIDE`;

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
