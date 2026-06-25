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

function labelPart(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{2}-\d{2}$/.test(raw)) return raw;
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function labelForGroup(group) {
  if (!group) return "No benchmark";
  return [group.division, group.gender, group.ageGroup].map(labelPart).filter(Boolean).join(" ") || "All HYROX";
}

export function performanceBandForGoal(targetSeconds) {
  if (!Number.isFinite(targetSeconds)) return null;
  const minutes = targetSeconds / 60;
  for (const threshold of [60, 65, 70, 75, 80, 90, 105]) {
    if (minutes <= threshold) return `sub_${threshold}`;
  }
  return null;
}

const NEXT_BAND_MAP = Object.freeze({
  sub_105: "sub_90",
  sub_90: "sub_80",
  sub_80: "sub_75",
  sub_75: "sub_70",
  sub_70: "sub_65",
  sub_65: "sub_60",
  sub_60: null,
});

export function nextPerformanceBand(band) {
  return NEXT_BAND_MAP[band] ?? null;
}

export function confidenceLabelFromSampleSize(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return "insufficient";
  if (num >= 100) return "strong";
  if (num >= 30) return "directional";
  return "low-confidence";
}

function groupFromSelection(selection) {
  if (!selection || selection.suppressed) return null;
  const group = getBenchmarkGroup(selection.benchmarkUsed);
  return {
    key: selection.benchmarkUsed,
    label: labelForGroup(group),
    sampleSize: selection.sampleSize,
    ...group,
    benchmarkRequested: selection.benchmarkRequested,
    fallbackLevel: selection.fallbackLevel,
    fallbackReason: selection.fallbackReason,
    confidenceScore: selection.confidenceScore,
    confidenceGrade: selection.confidenceGrade,
    confidence: selection.confidence,
  };
}

export function selectBenchmarkGroups(normalisedSubmission, options = {}) {
  const datasetVersion = options.datasetVersion ?? DEFAULT_DATASET_VERSION;
  if (!hasBenchmarkData()) {
    return {
      available: false,
      primaryBenchmarkGroup: null,
      demographicBenchmarkGroup: null,
      achievedBand: null,
      nextBand: null,
      nextBandGroup: null,
      confidenceLabel: null,
      fallbacksUsed: [],
      goalBenchmarkGroup: null,
    };
  }
  const calculatorMode = options.calculatorMode ?? "target";
  const isAnalyseMode = calculatorMode === "analyse";

  const division = normalisedSubmission.athlete?.division ?? normalisedSubmission.race?.division ?? "open";
  const gender = normalisedSubmission.athlete?.sex ?? normalisedSubmission.athlete?.gender ?? "unknown";
  const ageGroup = normalisedSubmission.athlete?.ageGroup ?? null;
  const request = { datasetVersion, division, gender, ageGroup };
  const selected = selectBenchmark(request, "total_time", "overallPercentile");
  if (selected.suppressed) {
    return {
      available: false,
      primaryBenchmarkGroup: null,
      demographicBenchmarkGroup: null,
      achievedBand: null,
      nextBand: null,
      nextBandGroup: null,
      confidenceLabel: null,
      fallbacksUsed: selected.attempted ?? [],
      goalBenchmarkGroup: null,
      suppressedReason: selected.reason,
    };
  }
  const fallbacksUsed = [
    ...(ageGroup ? [] : [{ key: groupKey({ datasetVersion, division, gender, ageGroup: "unknown" }), reason: "age_group_missing" }]),
    ...(selected.fallbackLevel > 0 ? [{
      key: selected.benchmarkRequested,
      reason: selected.fallbackReason,
      fallbackLevel: selected.fallbackLevel,
    }] : []),
  ];

  let achievedBand = null;
  let confidenceLabel = null;

  if (isAnalyseMode) {
    const finishTimeSeconds = normalisedSubmission.race?.finishTimeSeconds;
    achievedBand = performanceBandForGoal(finishTimeSeconds);

    if (achievedBand) {
      const bandRequest = { datasetVersion, division, gender, performanceBand: achievedBand };
      const bandSelection = selectBenchmark(bandRequest, "total_time", "overallPercentile", { performanceTarget: true });

      if (!bandSelection.suppressed) {
        const nextBand = nextPerformanceBand(achievedBand);
        const nextBandSelection = nextBand
          ? selectBenchmark({ datasetVersion, division, gender, performanceBand: nextBand }, "total_time", "overallPercentile", { performanceTarget: true })
          : null;
        return {
          available: true,
          primaryBenchmarkGroup: groupFromSelection(bandSelection),
          demographicBenchmarkGroup: groupFromSelection(selected),
          achievedBand,
          nextBand,
          nextBandGroup: groupFromSelection(nextBandSelection),
          confidenceLabel: confidenceLabelFromSampleSize(bandSelection.sampleSize),
          fallbacksUsed,
          goalBenchmarkGroup: null,
        };
      }

      confidenceLabel = "insufficient";
    }
  }

  const targetSeconds = Number(normalisedSubmission.race?.targetTimeSeconds ?? normalisedSubmission.athleteContext?.goalTimeSeconds);
  const band = performanceBandForGoal(targetSeconds);
  const goalSelection = band
    ? selectBenchmark({ datasetVersion, division, gender, ageGroup, performanceBand: band }, "total_time", "overallPercentile", { performanceTarget: true })
    : null;

  return {
    available: true,
    primaryBenchmarkGroup: groupFromSelection(selected),
    demographicBenchmarkGroup: null,
    achievedBand: isAnalyseMode ? achievedBand : null,
    nextBand: null,
    nextBandGroup: null,
    confidenceLabel: isAnalyseMode ? confidenceLabel : null,
    fallbacksUsed,
    goalBenchmarkGroup: isAnalyseMode ? null : groupFromSelection(goalSelection),
  };
}
