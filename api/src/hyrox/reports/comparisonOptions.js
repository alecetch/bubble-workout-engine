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
