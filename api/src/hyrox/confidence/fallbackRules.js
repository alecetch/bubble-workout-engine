import { DEFAULT_DATASET_VERSION } from "../config/benchmarkThresholds.js";

function keyPart(value) {
  return String(value ?? "all").replace(/[^a-z0-9_+-]+/gi, "_").toLowerCase();
}

export function makeBenchmarkGroupKey({ datasetVersion = DEFAULT_DATASET_VERSION, division = null, gender = null, ageGroup = null, performanceBand = null }) {
  if (performanceBand) {
    return ["hyrox", datasetVersion, "band", keyPart(performanceBand), keyPart(division), keyPart(gender)].join(":");
  }
  return ["hyrox", datasetVersion, keyPart(division), keyPart(gender), keyPart(ageGroup)].join(":");
}

function adjacentAgeBand(ageGroup) {
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

function isIndividualDivision(division) {
  return [
    "open",
    "pro",
    "doubles",
    "doubles_male",
    "doubles_female",
    "doubles_mixed",
    "pro_doubles_male",
    "pro_doubles_female",
    "pro_doubles_mixed",
  ].includes(division);
}

export function buildFallbackChain(request = {}) {
  const datasetVersion = request.datasetVersion ?? DEFAULT_DATASET_VERSION;
  const division = request.division ?? "open";
  const gender = request.gender ?? request.sex ?? "unknown";
  const ageGroup = request.ageGroup ?? request.age_group ?? null;

  if (!isIndividualDivision(division)) return [];

  const chain = [];
  const requestedKey = makeBenchmarkGroupKey({ datasetVersion, division, gender, ageGroup });

  if (ageGroup) {
    chain.push({
      groupKey: requestedKey,
      benchmarkRequested: requestedKey,
      level: 0,
      matchType: "exact",
      division,
      gender,
      ageGroup,
    });

    const adjacent = adjacentAgeBand(ageGroup);
    if (adjacent) {
      chain.push({
        groupKey: makeBenchmarkGroupKey({ datasetVersion, division, gender, ageGroup: adjacent }),
        benchmarkRequested: requestedKey,
        level: 1,
        matchType: "adjacent_age_band",
        division,
        gender,
        ageGroup: adjacent,
      });
    }
  }

  chain.push({
    groupKey: makeBenchmarkGroupKey({ datasetVersion, division, gender }),
    benchmarkRequested: requestedKey,
    level: 2,
    matchType: "sex_division",
    division,
    gender,
    ageGroup: null,
  });

  chain.push({
    groupKey: makeBenchmarkGroupKey({ datasetVersion, division }),
    benchmarkRequested: requestedKey,
    level: 3,
    matchType: "division_only",
    division,
    gender: null,
    ageGroup: null,
  });

  chain.push({
    groupKey: makeBenchmarkGroupKey({ datasetVersion }),
    benchmarkRequested: requestedKey,
    level: 4,
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
  const gender = request.gender ?? request.sex ?? "unknown";
  const performanceBand = request.performanceBand;
  if (!performanceBand || !isIndividualDivision(division)) return [];

  return [
    { division, gender, performanceBand, level: 0, matchType: "exact" },
    { division: null, gender, performanceBand, level: 1, matchType: "sex_only" },
    { division, gender: null, performanceBand, level: 2, matchType: "division_only" },
    { division: null, gender: null, performanceBand, level: 3, matchType: "population" },
  ].map((candidate) => ({
    ...candidate,
    groupKey: makeBenchmarkGroupKey({ datasetVersion, ...candidate }),
    benchmarkRequested: makeBenchmarkGroupKey({ datasetVersion, division, gender, performanceBand }),
  }));
}
