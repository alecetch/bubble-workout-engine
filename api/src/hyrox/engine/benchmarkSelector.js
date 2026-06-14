import { DEFAULT_DATASET_VERSION } from "../config/benchmarkThresholds.js";
import { selectBenchmark } from "../confidence/benchmarkSelector.js";
import { getBenchmarkGroup, hasBenchmarkData } from "./benchmarkService.js";

function keyPart(value) {
  return String(value ?? "all").replace(/[^a-z0-9_+-]+/gi, "_").toLowerCase();
}

function groupKey({ datasetVersion = DEFAULT_DATASET_VERSION, division = null, gender = null, ageGroup = null, performanceBand = null }) {
  if (performanceBand) {
    return ["hyrox", datasetVersion, "band", keyPart(performanceBand), keyPart(division), keyPart(gender)].join(":");
  }
  return ["hyrox", datasetVersion, keyPart(division), keyPart(gender), keyPart(ageGroup)].join(":");
}

function labelForGroup(group) {
  if (!group) return "No benchmark";
  if (group.performanceBand) return `${group.performanceBand} ${group.division ?? "all"} ${group.gender ?? "all"}`;
  return [group.division, group.gender, group.ageGroup].filter(Boolean).join(" / ") || "All HYROX";
}

function performanceBandForGoal(targetSeconds) {
  if (!Number.isFinite(targetSeconds)) return null;
  const minutes = targetSeconds / 60;
  for (const threshold of [60, 65, 70, 75, 80, 90, 105]) {
    if (minutes <= threshold) return `sub_${threshold}`;
  }
  return null;
}

export function selectBenchmarkGroups(normalisedSubmission, options = {}) {
  const datasetVersion = options.datasetVersion ?? DEFAULT_DATASET_VERSION;
  if (!hasBenchmarkData()) {
    return {
      available: false,
      primaryBenchmarkGroup: null,
      fallbacksUsed: [],
      goalBenchmarkGroup: null,
    };
  }

  const division = normalisedSubmission.athlete?.division ?? normalisedSubmission.race?.division ?? "open";
  const gender = normalisedSubmission.athlete?.sex ?? normalisedSubmission.athlete?.gender ?? "unknown";
  const ageGroup = normalisedSubmission.athlete?.ageGroup ?? null;
  const request = { datasetVersion, division, gender, ageGroup };
  const selected = selectBenchmark(request, "total_time", "overallPercentile");
  if (selected.suppressed) {
    return {
      available: false,
      primaryBenchmarkGroup: null,
      fallbacksUsed: selected.attempted ?? [],
      goalBenchmarkGroup: null,
      suppressedReason: selected.reason,
    };
  }
  const selectedGroup = getBenchmarkGroup(selected.benchmarkUsed);
  const fallbacksUsed = [
    ...(ageGroup ? [] : [{ key: groupKey({ datasetVersion, division, gender, ageGroup: "unknown" }), reason: "age_group_missing" }]),
    ...(selected.fallbackLevel > 0 ? [{
      key: selected.benchmarkRequested,
      reason: selected.fallbackReason,
      fallbackLevel: selected.fallbackLevel,
    }] : []),
  ];

  const targetSeconds = Number(normalisedSubmission.race?.targetTimeSeconds ?? normalisedSubmission.athleteContext?.goalTimeSeconds);
  const band = performanceBandForGoal(targetSeconds);
  const goalSelection = band
    ? selectBenchmark({ datasetVersion, division, gender, ageGroup, performanceBand: band }, "total_time", "overallPercentile", { performanceTarget: true })
    : null;
  const goalGroup = goalSelection && !goalSelection.suppressed ? getBenchmarkGroup(goalSelection.benchmarkUsed) : null;

  return {
    available: true,
    primaryBenchmarkGroup: selected
      ? {
          key: selected.benchmarkUsed,
          label: labelForGroup(selectedGroup),
          sampleSize: selected.sampleSize,
          ...selectedGroup,
          benchmarkRequested: selected.benchmarkRequested,
          fallbackLevel: selected.fallbackLevel,
          fallbackReason: selected.fallbackReason,
          confidenceScore: selected.confidenceScore,
          confidenceGrade: selected.confidenceGrade,
          confidence: selected.confidence,
        }
      : null,
    fallbacksUsed,
    goalBenchmarkGroup: goalGroup
      ? {
          key: goalSelection.benchmarkUsed,
          label: labelForGroup(goalGroup),
          sampleSize: goalSelection.sampleSize,
          ...goalGroup,
          benchmarkRequested: goalSelection.benchmarkRequested,
          fallbackLevel: goalSelection.fallbackLevel,
          fallbackReason: goalSelection.fallbackReason,
          confidenceScore: goalSelection.confidenceScore,
          confidenceGrade: goalSelection.confidenceGrade,
          confidence: goalSelection.confidence,
        }
      : null,
  };
}
