import {
  DEFAULT_DATASET_VERSION,
  PERFORMANCE_BAND_KEYS_WITH_OVER_120,
  PERFORMANCE_BAND_THRESHOLDS_MINUTES,
} from "../config/benchmarkThresholds.js";
import { isHistoricalBenchmarkDataset } from "../config/ageGroups.js";
import { featureFlags } from "../config/featureFlags.js";
import {
  ENRICHED_DOUBLES_DIVISIONS,
  isDoublesAnalysisDivision,
  normaliseAnalysisDivision,
} from "../config/divisionGroups.js";
import { countryToRegion, REGION_LABELS } from "../config/regionMapping.js";
import { selectBenchmark } from "../confidence/benchmarkSelector.js";
import { adjacentAgeBands, makeBenchmarkGroupKey } from "../confidence/fallbackRules.js";
import { getBenchmarkGroup, hasBenchmarkData } from "./benchmarkService.js";
import { scoreTimeAgainstGroup } from "./percentileCalculator.js";

function keyPart(value) {
  return String(value ?? "all").replace(/[^a-z0-9_+-]+/gi, "_").toLowerCase();
}

// Normalize single-letter sex codes to the full-word format used in DB benchmark group keys.
function normalizeSex(raw) {
  const v = String(raw ?? "").toLowerCase().trim();
  if (v === "m") return "male";
  if (v === "w" || v === "f") return "female";
  return String(raw ?? "");
}

function normalizeBenchmarkAgeGroup(ageGroup, { datasetVersion = null } = {}) {
  const key = String(ageGroup ?? "").trim();
  if (key === "18-24") return "16-24";
  if (key === "65-69" && isHistoricalBenchmarkDataset(datasetVersion)) return "70+";
  return ageGroup ?? null;
}

function groupKey({ datasetVersion = DEFAULT_DATASET_VERSION, division = null, gender = null, ageGroup = null, performanceBand = null, region = null }) {
  if (performanceBand) {
    return ["hyrox", datasetVersion, "band", keyPart(performanceBand), keyPart(division), keyPart(gender)].join(":");
  }
  const base = ["hyrox", datasetVersion, keyPart(division), keyPart(gender), keyPart(ageGroup)].join(":");
  return region ? `${base}:${keyPart(region)}` : base;
}

function labelPart(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^(all|unknown)$/i.test(raw)) return null;
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

export function performanceBandForGoal(targetSeconds, options = {}) {
  if (!Number.isFinite(targetSeconds)) return null;
  const minutes = targetSeconds / 60;
  for (const threshold of PERFORMANCE_BAND_THRESHOLDS_MINUTES) {
    if (minutes < threshold) return `sub_${threshold}`;
  }
  if (options.includeOver105) return "over_120";
  return null;
}

export const PERFORMANCE_BAND_ORDER = PERFORMANCE_BAND_KEYS_WITH_OVER_120;

export function nextPerformanceBand(band) {
  const index = PERFORMANCE_BAND_ORDER.indexOf(band);
  return index > 0 ? PERFORMANCE_BAND_ORDER[index - 1] : null;
}

export function confidenceLabelFromSampleSize(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return "insufficient";
  if (num >= 100) return "strong";
  // Forward-compatible vocabulary if overallPercentile ever allows sub-100 sample bands through.
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

function isFasterPerformanceBand(candidateBand, referenceBand) {
  const candidateIndex = PERFORMANCE_BAND_ORDER.indexOf(candidateBand);
  const referenceIndex = PERFORMANCE_BAND_ORDER.indexOf(referenceBand);
  return candidateIndex >= 0 && referenceIndex >= 0 && candidateIndex < referenceIndex;
}

function genderFromDoublesDivision(division) {
  if (division.endsWith("_male")) return "male";
  if (division.endsWith("_female")) return "female";
  return "mixed";
}

function buildAgeBenchmarkLabel(group) {
  if (!group) return null;
  return [group.ageGroup, group.gender, group.division].map(labelPart).filter(Boolean).join(" ") || null;
}

function ageBenchmarkFromKey(groupKeyValue, ageGroup, finishTimeSeconds = null) {
  const group = getBenchmarkGroup(groupKeyValue);
  if (!group || Number(group.sampleSize ?? 0) < 100) return null;
  const fieldPercentile = Number.isFinite(finishTimeSeconds)
    ? (scoreTimeAgainstGroup(finishTimeSeconds, groupKeyValue, "total_time") ?? null)
    : null;
  return {
    available: true,
    ageGroup,
    groupKey: groupKeyValue,
    sampleSize: group.sampleSize,
    datasetVersion: group.datasetVersion,
    label: buildAgeBenchmarkLabel({ ...group, ageGroup }),
    fieldPercentile,
  };
}

function computeAgeBenchmarkAvailability({ datasetVersion, division, gender, ageGroup, finishTimeSeconds = null }) {
  if (!ageGroup || ageGroup === "all") return { available: false };
  const exactKey = makeBenchmarkGroupKey({ datasetVersion, division, gender, ageGroup });
  const exact = ageBenchmarkFromKey(exactKey, ageGroup, finishTimeSeconds);
  if (exact) return exact;

  for (const adjacent of adjacentAgeBands(ageGroup, datasetVersion)) {
    const adjacentKey = makeBenchmarkGroupKey({ datasetVersion, division, gender, ageGroup: adjacent });
    const adjacentGroup = ageBenchmarkFromKey(adjacentKey, adjacent, finishTimeSeconds);
    if (adjacentGroup) return adjacentGroup;
  }

  return { available: false };
}

function computeRegionalBenchmark({ datasetVersion, division, gender, region, finishTimeSeconds }) {
  if (!region) return { available: false };
  const regionalKey = makeBenchmarkGroupKey({ datasetVersion, division, gender, region });
  const group = getBenchmarkGroup(regionalKey);
  if (!group || Number(group.sampleSize ?? 0) < 200) return { available: false };
  const fieldPercentile = scoreTimeAgainstGroup(finishTimeSeconds, regionalKey, "total_time");
  return {
    available: true,
    region,
    regionLabel: REGION_LABELS[region] ?? region,
    groupKey: regionalKey,
    sampleSize: group.sampleSize,
    datasetVersion: group.datasetVersion,
    fieldPercentile: fieldPercentile ?? null,
  };
}

function computeTotalPopulationBenchmark({ datasetVersion, division, gender, useDoublesBenchmarks }) {
  const totalGender = useDoublesBenchmarks ? "all" : gender;
  const groupKeyValue = makeBenchmarkGroupKey({ datasetVersion, division, gender: totalGender, ageGroup: "all" });
  const group = getBenchmarkGroup(groupKeyValue);
  if (!group || Number(group.sampleSize ?? 0) < 100) return { available: false };
  return {
    available: true,
    groupKey: groupKeyValue,
    sampleSize: group.sampleSize,
    datasetVersion: group.datasetVersion,
    label: labelForGroup(group),
  };
}

function resolveSinglesDatasetVersion(flag, request) {
  if (flag === "legacy") return { datasetVersion: request.datasetVersion, fallback: null };
  if (flag === "s8") return { datasetVersion: "singles_s8_v1", fallback: null };

  const s8Request = { ...request, datasetVersion: "singles_s8_v1" };
  const s8Check = selectBenchmark(s8Request, "total_time", "overallPercentile");
  if (!s8Check.suppressed) return { datasetVersion: "singles_s8_v1", fallback: null };

  return {
    datasetVersion: request.datasetVersion,
    fallback: {
      key: s8Check.benchmarkRequested ?? groupKey(s8Request),
      reason: "singles_s8_unavailable_using_legacy",
      attempted: s8Check.attempted ?? [],
    },
  };
}

const ENRICHED_DOUBLES_DIVISION_SET = new Set(ENRICHED_DOUBLES_DIVISIONS);

export function selectBenchmarkGroups(normalisedSubmission, options = {}) {
  const datasetVersion = options.datasetVersion ?? DEFAULT_DATASET_VERSION;
  if (!hasBenchmarkData()) {
    return {
      available: false,
      primaryBenchmarkGroup: null,
      demographicBenchmarkGroup: null,
      achievedBand: null,
      escalationBasisBand: null,
      escalationBasisBandGroup: null,
      nextBand: null,
      nextBandGroup: null,
      confidenceLabel: null,
      fallbacksUsed: [],
      goalBenchmarkGroup: null,
      doublesBenchmarkedAsSingles: false,
      useDoublesBenchmarks: false,
      ageBenchmark: { available: false },
      regionalBenchmark: { available: false },
      totalPopulationBenchmark: { available: false },
    };
  }
  const calculatorMode = options.calculatorMode ?? "target";
  const isAnalyseMode = calculatorMode === "analyse";

  const rawDivision = normalisedSubmission.athlete?.division ?? normalisedSubmission.race?.division ?? "open";
  const canonicalDivision = normaliseAnalysisDivision(rawDivision);
  const isDoubles = isDoublesAnalysisDivision(rawDivision);
  const gender = normalizeSex(normalisedSubmission.athlete?.sex ?? normalisedSubmission.athlete?.gender ?? "unknown");
  let division = rawDivision;
  let doublesBenchmarkedAsSingles = false;
  let useDoublesBenchmarks = false;
  let benchmarkDatasetVersion = datasetVersion;
  let benchmarkGender = gender;
  let benchmarkAgeGroup = normalizeBenchmarkAgeGroup(normalisedSubmission.athlete?.ageGroup);
  const eventCountry = normalisedSubmission.race?.eventCountry ?? null;
  const athleteRegion = countryToRegion(eventCountry);

  if (isDoubles) {
    const doublesDivision =
      ENRICHED_DOUBLES_DIVISION_SET.has(canonicalDivision) ? canonicalDivision
        : canonicalDivision === "pro_doubles"
          ? (gender === "female" ? "pro_doubles_female" : gender === "mixed" ? "pro_doubles_mixed" : "pro_doubles_male")
        : canonicalDivision === "doubles_mixed" ? "doubles_mixed"
        : gender === "female" ? "doubles_female"
          : "doubles_male";

    const doublesSource = featureFlags.doublesBenchmarkSource;
    if (doublesSource === "enriched" || doublesSource === "auto") {
      const doublesRequest = {
        datasetVersion: "doubles_v2",
        division: doublesDivision,
        gender: "all",
        ageGroup: "all",
      };
      const doublesCheck = selectBenchmark(doublesRequest, "total_time", "overallPercentile");
      if (!doublesCheck.suppressed && (doublesCheck.sampleSize ?? 0) >= 100) {
        division = doublesDivision;
        useDoublesBenchmarks = true;
        benchmarkDatasetVersion = "doubles_v2";
        benchmarkGender = genderFromDoublesDivision(doublesDivision);
        benchmarkAgeGroup = benchmarkAgeGroup ?? "all";
      } else {
        division = "open";
        doublesBenchmarkedAsSingles = true;
      }
    } else if (canonicalDivision === "doubles_mixed") {
      division = "doubles_mixed";
    } else {
      const historicalDoublesCheck = selectBenchmark(
        { datasetVersion, division: "doubles", gender, ageGroup: normalizeBenchmarkAgeGroup(benchmarkAgeGroup, { datasetVersion }) },
        "total_time",
        "overallPercentile",
      );
      if (!historicalDoublesCheck.suppressed) {
        division = "doubles";
      } else {
        division = "open";
        doublesBenchmarkedAsSingles = true;
      }
    }
  }

  let singlesDatasetFallback = null;
  if (!useDoublesBenchmarks && !isDoubles) {
    const resolved = resolveSinglesDatasetVersion(featureFlags.singlesBenchmarkSource, {
      datasetVersion: benchmarkDatasetVersion,
      division,
      gender: benchmarkGender,
      ageGroup: benchmarkAgeGroup,
    });
    benchmarkDatasetVersion = resolved.datasetVersion;
    singlesDatasetFallback = resolved.fallback;
  }

  benchmarkAgeGroup = normalizeBenchmarkAgeGroup(benchmarkAgeGroup, { datasetVersion: benchmarkDatasetVersion });

  const ageGroup = benchmarkAgeGroup;
  const request = { datasetVersion: benchmarkDatasetVersion, division, gender: benchmarkGender, ageGroup };
  const selected = selectBenchmark(request, "total_time", "overallPercentile");
  const ageBenchmark = computeAgeBenchmarkAvailability({
    datasetVersion: benchmarkDatasetVersion,
    division,
    gender: benchmarkGender,
    ageGroup,
    finishTimeSeconds: normalisedSubmission.race?.finishTimeSeconds ?? null,
  });
  const regionalBenchmark = computeRegionalBenchmark({
    datasetVersion: benchmarkDatasetVersion,
    division,
    gender: benchmarkGender,
    region: athleteRegion,
    finishTimeSeconds: normalisedSubmission.race?.finishTimeSeconds ?? null,
  });
  const totalPopulationBenchmark = computeTotalPopulationBenchmark({
    datasetVersion: benchmarkDatasetVersion,
    division,
    gender: benchmarkGender,
    useDoublesBenchmarks,
  });
  if (selected.suppressed) {
    return {
      available: false,
      primaryBenchmarkGroup: null,
      demographicBenchmarkGroup: null,
      achievedBand: null,
      escalationBasisBand: null,
      escalationBasisBandGroup: null,
      nextBand: null,
      nextBandGroup: null,
      confidenceLabel: null,
      fallbacksUsed: selected.attempted ?? [],
      goalBenchmarkGroup: null,
      suppressedReason: selected.reason,
      doublesBenchmarkedAsSingles,
      useDoublesBenchmarks,
      ageBenchmark: { available: false },
      regionalBenchmark: { available: false },
      totalPopulationBenchmark: { available: false },
    };
  }
  const fallbacksUsed = [
    ...(singlesDatasetFallback ? [singlesDatasetFallback] : []),
    ...(ageGroup ? [] : [{ key: groupKey({ datasetVersion: benchmarkDatasetVersion, division, gender: benchmarkGender, ageGroup: "unknown" }), reason: "age_group_missing" }]),
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
    achievedBand = performanceBandForGoal(finishTimeSeconds, { includeOver105: true });

    if (achievedBand) {
      const performanceGender = useDoublesBenchmarks ? "all" : benchmarkGender;
      const bandRequest = { datasetVersion: benchmarkDatasetVersion, division, gender: performanceGender, performanceBand: achievedBand };
      const bandSelection = selectBenchmark(bandRequest, "total_time", "overallPercentile", { performanceTarget: true });

      if (!bandSelection.suppressed) {
        let escalationBasisBand = achievedBand;
        let escalationBasisSelection = bandSelection;
        const adjustedFinishTimeSeconds = Number(options.adjustedFinishTimeSeconds);
        const adjustedAchievedBand = Number.isFinite(adjustedFinishTimeSeconds)
          ? performanceBandForGoal(adjustedFinishTimeSeconds, { includeOver105: true })
          : null;

        if (isFasterPerformanceBand(adjustedAchievedBand, achievedBand)) {
          const adjustedBandSelection = selectBenchmark(
            { datasetVersion: benchmarkDatasetVersion, division, gender: performanceGender, performanceBand: adjustedAchievedBand },
            "total_time",
            "overallPercentile",
            { performanceTarget: true },
          );
          if (!adjustedBandSelection.suppressed) {
            escalationBasisBand = adjustedAchievedBand;
            escalationBasisSelection = adjustedBandSelection;
          }
        }

        const nextBand = nextPerformanceBand(escalationBasisBand);
        const nextBandSelection = nextBand
          ? selectBenchmark({ datasetVersion: benchmarkDatasetVersion, division, gender: performanceGender, performanceBand: nextBand }, "total_time", "overallPercentile", { performanceTarget: true })
          : null;
        return {
          available: true,
          primaryBenchmarkGroup: groupFromSelection(bandSelection),
          demographicBenchmarkGroup: groupFromSelection(selected),
          achievedBand,
          escalationBasisBand,
          escalationBasisBandGroup: groupFromSelection(escalationBasisSelection),
          adjustedAchievedBand: adjustedAchievedBand ?? null,
          nextBand,
          nextBandGroup: groupFromSelection(nextBandSelection),
          confidenceLabel: confidenceLabelFromSampleSize(bandSelection.sampleSize),
          fallbacksUsed,
          goalBenchmarkGroup: null,
          doublesBenchmarkedAsSingles,
          useDoublesBenchmarks,
          ageBenchmark,
          regionalBenchmark,
          totalPopulationBenchmark,
        };
      }

      confidenceLabel = "insufficient";
    }
  }

  const targetSeconds = Number(
    normalisedSubmission.race?.targetTimeSeconds
      ?? normalisedSubmission.race?.targetFinishTimeSeconds
      ?? normalisedSubmission.athleteContext?.targetFinishTimeSeconds
      ?? normalisedSubmission.athleteContext?.targetTimeSeconds
      ?? normalisedSubmission.athleteContext?.goalTimeSeconds,
  );
  const band = performanceBandForGoal(targetSeconds, { includeOver105: true });
  const performanceGender = useDoublesBenchmarks ? "all" : benchmarkGender;
  const goalSelection = band
    ? selectBenchmark({ datasetVersion: benchmarkDatasetVersion, division, gender: performanceGender, ageGroup, performanceBand: band }, "total_time", "overallPercentile", { performanceTarget: true })
    : null;
  const selectedGoalGroup = groupFromSelection(goalSelection);
  const selectedPrimaryGroup = groupFromSelection(selected);
  const fallbackGoalGroup = !isAnalyseMode && !selectedGoalGroup && selectedPrimaryGroup && Number.isFinite(targetSeconds) && targetSeconds > 0
    ? {
      ...selectedPrimaryGroup,
      targetFinishSeconds: targetSeconds,
      targetFallback: "scaled_primary_benchmark",
      fallbackReason: "performance_band_unavailable",
    }
    : null;

  return {
    available: true,
    primaryBenchmarkGroup: selectedPrimaryGroup,
    demographicBenchmarkGroup: null,
    achievedBand: isAnalyseMode ? achievedBand : null,
    escalationBasisBand: isAnalyseMode ? achievedBand : null,
    escalationBasisBandGroup: isAnalyseMode ? selectedPrimaryGroup : null,
    nextBand: null,
    nextBandGroup: null,
    confidenceLabel: isAnalyseMode ? confidenceLabel : null,
    fallbacksUsed,
    goalBenchmarkGroup: isAnalyseMode ? null : selectedGoalGroup ?? fallbackGoalGroup,
    doublesBenchmarkedAsSingles,
    useDoublesBenchmarks,
    ageBenchmark,
    regionalBenchmark,
    totalPopulationBenchmark,
  };
}
