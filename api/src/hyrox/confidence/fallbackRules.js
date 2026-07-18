import { DEFAULT_DATASET_VERSION } from "../config/benchmarkThresholds.js";
import { adjacentGranularAgeGroups, usesGranularBenchmarkAgeGroups } from "../config/ageGroups.js";
import { isIndividualAnalysisDivision } from "../config/divisionGroups.js";

function keyPart(value) {
  return String(value ?? "all").replace(/[^a-z0-9_+-]+/gi, "_").toLowerCase();
}

function fallbackGender(value) {
  const key = String(value ?? "").trim().toLowerCase();
  if (!key || key === "unknown") return null;
  return value;
}

export function makeBenchmarkGroupKey({ datasetVersion = DEFAULT_DATASET_VERSION, division = null, gender = null, ageGroup = null, performanceBand = null, region = null }) {
  if (performanceBand) {
    return ["hyrox", datasetVersion, "band", keyPart(performanceBand), keyPart(division), keyPart(gender)].join(":");
  }
  const base = ["hyrox", datasetVersion, keyPart(division), keyPart(gender), keyPart(ageGroup)].join(":");
  return region ? `${base}:${keyPart(region)}` : base;
}

export function adjacentAgeBand(ageGroup) {
  const text = String(ageGroup ?? "");
  const match = text.match(/^(\d{2})-(\d{2})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 35) return "broad_30_39";
  if (start < 50) return "broad_40_49";
  if (start < 60) return "broad_50_59";
  return "broad_40_plus";
}

export function adjacentAgeBands(ageGroup, datasetVersion = DEFAULT_DATASET_VERSION) {
  if (usesGranularBenchmarkAgeGroups(datasetVersion)) return adjacentGranularAgeGroups(ageGroup);
  const legacyAdjacent = adjacentAgeBand(ageGroup);
  return legacyAdjacent ? [legacyAdjacent] : [];
}

export function isIndividualDivision(division) {
  return isIndividualAnalysisDivision(division);
}

export function buildFallbackChain(request = {}) {
  const datasetVersion = request.datasetVersion ?? DEFAULT_DATASET_VERSION;
  const division = request.division ?? "open";
  const gender = fallbackGender(request.gender ?? request.sex);
  const ageGroup = request.ageGroup ?? request.age_group ?? null;
  const region = request.region ?? null;

  if (!isIndividualDivision(division)) return [];

  const chain = [];
  const requestedKey = makeBenchmarkGroupKey({ datasetVersion, division, gender, ageGroup });

  if (ageGroup) {
    if (region) {
      chain.push({
        groupKey: makeBenchmarkGroupKey({ datasetVersion, division, gender, ageGroup, region }),
        benchmarkRequested: requestedKey,
        level: 0,
        matchType: "exact_regional",
        division,
        gender,
        ageGroup,
        region,
      });
    }

    chain.push({
      groupKey: requestedKey,
      benchmarkRequested: requestedKey,
      level: region ? 1 : 0,
      matchType: "exact",
      division,
      gender,
      ageGroup,
    });

    for (const adjacent of adjacentAgeBands(ageGroup, datasetVersion)) {
      if (region) {
        chain.push({
          groupKey: makeBenchmarkGroupKey({ datasetVersion, division, gender, ageGroup: adjacent, region }),
          benchmarkRequested: requestedKey,
          level: 2,
          matchType: "adjacent_regional",
          division,
          gender,
          ageGroup: adjacent,
          region,
        });
      }

      chain.push({
        groupKey: makeBenchmarkGroupKey({ datasetVersion, division, gender, ageGroup: adjacent }),
        benchmarkRequested: requestedKey,
        level: region ? 3 : 1,
        matchType: "adjacent_age_band",
        division,
        gender,
        ageGroup: adjacent,
      });
    }
  }

  if (region) {
    chain.push({
      groupKey: makeBenchmarkGroupKey({ datasetVersion, division, gender, region }),
      benchmarkRequested: requestedKey,
      level: ageGroup ? 4 : 0,
      matchType: "sex_division_regional",
      division,
      gender,
      ageGroup: null,
      region,
    });
  }

  chain.push({
    groupKey: makeBenchmarkGroupKey({ datasetVersion, division, gender }),
    benchmarkRequested: requestedKey,
    level: region ? (ageGroup ? 5 : 1) : 2,
    matchType: "sex_division",
    division,
    gender,
    ageGroup: null,
  });

  chain.push({
    groupKey: makeBenchmarkGroupKey({ datasetVersion, division }),
    benchmarkRequested: requestedKey,
    level: region ? (ageGroup ? 6 : 2) : 3,
    matchType: "division_only",
    division,
    gender: null,
    ageGroup: null,
  });

  chain.push({
    groupKey: makeBenchmarkGroupKey({ datasetVersion }),
    benchmarkRequested: requestedKey,
    level: region ? (ageGroup ? 7 : 3) : 4,
    matchType: "population",
    division: null,
    gender: null,
    ageGroup: null,
  });

  const seen = new Set();
  return chain.filter((candidate) => {
    if (seen.has(candidate.groupKey)) return false;
    seen.add(candidate.groupKey);
    return true;
  });
}

export function buildPerformanceTargetFallbackChain(request = {}) {
  const datasetVersion = request.datasetVersion ?? DEFAULT_DATASET_VERSION;
  const division = request.division ?? "open";
  const gender = fallbackGender(request.gender ?? request.sex);
  const performanceBand = request.performanceBand;
  if (!performanceBand || !isIndividualDivision(division)) return [];

  const chain = [
    { division, gender, performanceBand, level: 0, matchType: "exact" },
    { division: null, gender, performanceBand, level: 1, matchType: "sex_only" },
    { division, gender: null, performanceBand, level: 2, matchType: "division_only" },
    { division: null, gender: null, performanceBand, level: 3, matchType: "population" },
  ].map((candidate) => ({
    ...candidate,
    groupKey: makeBenchmarkGroupKey({ datasetVersion, ...candidate }),
    benchmarkRequested: makeBenchmarkGroupKey({ datasetVersion, division, gender, performanceBand }),
  }));

  const seen = new Set();
  return chain.filter((candidate) => {
    if (seen.has(candidate.groupKey)) return false;
    seen.add(candidate.groupKey);
    return true;
  });
}
