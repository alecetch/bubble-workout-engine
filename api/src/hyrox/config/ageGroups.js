export const GRANULAR_BENCHMARK_AGE_GROUPS = Object.freeze([
  "16-24", "25-29", "30-34", "35-39", "40-44", "45-49",
  "50-54", "55-59", "60-64", "65-69", "70-74", "75-79",
  "80-84", "85-89", "90+",
]);

export function usesGranularBenchmarkAgeGroups(datasetVersion = "") {
  return ["singles_s8_v1", "doubles_v2"].includes(String(datasetVersion));
}

export function isHistoricalBenchmarkDataset(datasetVersion = "") {
  return String(datasetVersion).startsWith("historical_hyrox_");
}

export function adjacentGranularAgeGroups(ageGroup) {
  const index = GRANULAR_BENCHMARK_AGE_GROUPS.indexOf(String(ageGroup ?? ""));
  if (index < 0) return [];
  return [
    GRANULAR_BENCHMARK_AGE_GROUPS[index - 1],
    GRANULAR_BENCHMARK_AGE_GROUPS[index + 1],
  ].filter(Boolean);
}
