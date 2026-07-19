import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_MAP, TRAINING_HINTS } from "../config/muscleGroupMap.js";

const MAP_BY_KEY = new Map(MUSCLE_GROUP_MAP.map((entry) => [entry.segmentKey, entry]));
const MUSCLE_GROUP_TIEBREAK_ORDER = Object.freeze([
  "posterior_chain",
  "quad_dominant",
  "upper_back_pull",
  "push_shoulder",
  "core_stability",
  "grip_forearm",
]);
const TIEBREAK_INDEX = new Map(MUSCLE_GROUP_TIEBREAK_ORDER.map((groupId, index) => [groupId, index]));

// Classify stations by gap direction — same axis as the losses table.
// Positive timeGapSeconds means the athlete is slower than the benchmark for that station (weak).
// Negative means faster (strong). Zero is neutral.
function gapClassify(stations) {
  return new Map(stations.map((s) => [
    s.segmentKey,
    s.timeGapSeconds > 0 ? "weak" : s.timeGapSeconds < 0 ? "strong" : "neutral",
  ]));
}

function tieBreakIndex(groupId) {
  return TIEBREAK_INDEX.get(groupId) ?? Number.MAX_SAFE_INTEGER;
}

function compareLimiters(a, b) {
  return b.weakCount - a.weakCount
    || a.strongCount - b.strongCount
    || tieBreakIndex(a.groupId) - tieBreakIndex(b.groupId);
}

function compareAssets(a, b) {
  return b.strongCount - a.strongCount
    || a.weakCount - b.weakCount
    || tieBreakIndex(a.groupId) - tieBreakIndex(b.groupId);
}

function groupCounter(counters, groupId) {
  return counters?.[groupId] ?? null;
}

function stationsForGroup(stationClassifications, groupId, relativeClass) {
  return stationClassifications.filter(
    (station) => station.relativeClass === relativeClass && station.primaryGroups.includes(groupId),
  );
}

function stationList(stations) {
  return stations.map((s) => s.label).join(", ");
}

function buildHeadline(primaryLimiters, primaryAssets, allBelowBenchmark, groupCounters) {
  const limiterLabels = primaryLimiters.map((id) => MUSCLE_GROUP_LABELS[id]);
  const assetLabels = primaryAssets.map((id) => MUSCLE_GROUP_LABELS[id]);
  if (limiterLabels.length === 0 && assetLabels.length === 0) {
    return "No clear muscle group pattern — focus on your biggest individual gap";
  }
  if (limiterLabels.length === 0) {
    if ((groupCounter(groupCounters, primaryAssets[0])?.strongCount ?? 0) === 1) {
      return `Your ${assetLabels[0]} is showing up as your clearest individual station strength`;
    }
    return `Your ${assetLabels[0]} stations are consistently your strongest`;
  }
  const assetClause = assetLabels.length > 0
    ? allBelowBenchmark
      ? `; your ${assetLabels[0]} is your relative strength`
      : `; your ${assetLabels[0]} is a clear strength`
    : "";
  if ((groupCounter(groupCounters, primaryLimiters[0])?.weakCount ?? 0) === 1) {
    return `${limiterLabels[0]} is showing up through your biggest individual station gap${assetClause}`;
  }
  if (limiterLabels.length >= 2) {
    return `${limiterLabels[0]} and ${limiterLabels[1]} are the common thread across your weakest stations${assetClause}`;
  }
  return `${limiterLabels[0]} is the common thread across your weakest stations${assetClause}`;
}

function buildBody(stationClassifications, primaryLimiters, primaryAssets, allBelowBenchmark, groupCounters) {
  const weakStations = stationClassifications.filter((s) => s.relativeClass === "weak");
  const strongStations = stationClassifications.filter((s) => s.relativeClass === "strong");

  if (primaryLimiters.length === 0) {
    if (primaryAssets.length === 0) return null;
    const assetLabel = MUSCLE_GROUP_LABELS[primaryAssets[0]];
    const assetStations = stationsForGroup(stationClassifications, primaryAssets[0], "strong");
    if ((groupCounter(groupCounters, primaryAssets[0])?.strongCount ?? 0) === 1) {
      return `${stationList(assetStations)} draws heavily on ${assetLabel} — your clearest individual station strength.`;
    }
    return `${stationList(strongStations)} all draw heavily on ${assetLabel} — your most consistent performing group.`;
  }

  const limiterLabel = MUSCLE_GROUP_LABELS[primaryLimiters[0]];
  const singleStationLimiter = (groupCounter(groupCounters, primaryLimiters[0])?.weakCount ?? 0) === 1;
  const limiterStations = stationsForGroup(stationClassifications, primaryLimiters[0], "weak");
  const parts = singleStationLimiter
    ? [
        `${stationList(limiterStations)} is your biggest individual station gap involving ${limiterLabel}. Treat it as a focused single-station signal, not a repeated pattern yet.`,
      ]
    : [
        `${stationList(weakStations)} — all relying heavily on ${limiterLabel} — are your lowest-ranked stations.`,
      ];

  if (primaryAssets.length > 0) {
    const assetLabel = MUSCLE_GROUP_LABELS[primaryAssets[0]];
    const assetStations = stationsForGroup(stationClassifications, primaryAssets[0], "strong");
    const strongList = stationList(assetStations);
    const singleStationAsset = (groupCounter(groupCounters, primaryAssets[0])?.strongCount ?? 0) === 1;
    if (allBelowBenchmark) {
      parts.push(`${strongList} ${singleStationAsset ? "recruits" : "recruit"} ${assetLabel} and ${singleStationAsset ? "is" : "are"} your comparatively stronger ${singleStationAsset ? "station" : "stations"} — there is still ground to close to benchmark, but this is the foundation to build from.`);
    } else {
      parts.push(`By contrast, ${strongList} — driven by ${assetLabel} — ${singleStationAsset ? "is your strongest benchmarked station" : "are your strongest benchmarked stations"}.`);
    }
  }

  parts.push(singleStationLimiter
    ? `Targeted ${limiterLabel.toLowerCase()} strength-endurance work is the most relevant station-specific investment.`
    : `A targeted ${limiterLabel.toLowerCase()} strength-endurance block is the highest-leverage cross-station investment.`);
  return parts.join(" ");
}

export function analyseMuscleGroups(analysisResult = {}) {
  if (analysisResult.analysisScope === "limited") return { available: false };

  const stations = (analysisResult.stationBreakdown ?? []).filter(
    (s) => s.confidence !== "low" && MAP_BY_KEY.has(s.segmentKey) && Number.isFinite(s.percentile),
  );
  if (stations.length < 3) return { available: false };

  const relClassMap = gapClassify(stations);

  const stationClassifications = stations.map((s) => ({
    segmentKey: s.segmentKey,
    label: s.label,
    relativeClass: relClassMap.get(s.segmentKey) ?? "neutral",
    percentile: s.percentile,
    primaryGroups: MAP_BY_KEY.get(s.segmentKey).primary,
  }));

  // Score each muscle group by how many of the athlete's relative-weak/strong stations it drives
  const groupCounters = {};
  for (const groupId of Object.keys(MUSCLE_GROUP_LABELS)) {
    groupCounters[groupId] = { groupId, label: MUSCLE_GROUP_LABELS[groupId], weakCount: 0, strongCount: 0 };
  }
  for (const station of stationClassifications) {
    for (const groupId of station.primaryGroups) {
      if (station.relativeClass === "weak") groupCounters[groupId].weakCount++;
      if (station.relativeClass === "strong") groupCounters[groupId].strongCount++;
    }
  }

  // Limiter: appears in any weak station, with weak count strictly exceeding strong count.
  const primaryLimiters = Object.values(groupCounters)
    .filter((g) => g.weakCount > 0 && g.weakCount > g.strongCount)
    .sort(compareLimiters)
    .slice(0, 2)
    .map((g) => g.groupId);

  // Asset: appears in any strong station, with strong count strictly exceeding weak count
  const primaryAssets = Object.values(groupCounters)
    .filter((g) => g.strongCount > 0 && g.strongCount > g.weakCount)
    .sort(compareAssets)
    .slice(0, 1)
    .map((g) => g.groupId);

  const muscleGroupSignals = Object.values(groupCounters).map((g) => ({
    ...g,
    signal: primaryLimiters.includes(g.groupId) ? "limiter"
      : primaryAssets.includes(g.groupId) ? "asset"
      : "neutral",
  }));

  // Flag when even the "strong" stations are below the 50th percentile — used to soften copy
  const allBelowBenchmark = stationClassifications.every((s) => (s.percentile ?? 0) < 50);

  const patternFound = primaryLimiters.length > 0 || primaryAssets.length > 0;

  return {
    available: true,
    patternFound,
    stationCount: stations.length,
    stationClassifications,
    muscleGroupSignals,
    primaryLimiters,
    primaryAssets,
    conclusion: {
      headline: buildHeadline(primaryLimiters, primaryAssets, allBelowBenchmark, groupCounters),
      body: buildBody(stationClassifications, primaryLimiters, primaryAssets, allBelowBenchmark, groupCounters),
      trainingHint: primaryLimiters[0] ? (TRAINING_HINTS[primaryLimiters[0]] ?? null) : null,
    },
  };
}
