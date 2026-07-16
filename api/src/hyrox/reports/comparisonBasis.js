export function hasGoalGroup(analysisJson = {}) {
  return Boolean(analysisJson.benchmarkContext?.goalBenchmarkGroup);
}

export function comparisonLabel(analysisJson = {}) {
  if ((analysisJson.segments ?? []).some((row) => Number.isFinite(row?.exactTargetSeconds))) return "TARGET";
  return hasGoalGroup(analysisJson) ? "TARGET BENCHMARK" : "MEDIAN";
}
