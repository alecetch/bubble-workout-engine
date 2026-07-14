import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_MAP, TRAINING_HINTS } from "../config/muscleGroupMap.js";

const MAP_BY_KEY = new Map(MUSCLE_GROUP_MAP.map((entry) => [entry.segmentKey, entry]));

// Classify stations by gap direction — same axis as the losses table.
// Positive timeGapSeconds means the athlete is slower than the benchmark for that station (weak).
// Negative means faster (strong). Zero is neutral.
function gapClassify(stations) {
  return new Map(stations.map((s) => [
    s.segmentKey,
    s.timeGapSeconds > 0 ? "weak" : s.timeGapSeconds < 0 ? "strong" : "neutral",
  ]));
}

function buildHeadline(primaryLimiters, primaryAssets, allBelowBenchmark) {
  const limiterLabels = primaryLimiters.map((id) => MUSCLE_GROUP_LABELS[id]);
  const assetLabels = primaryAssets.map((id) => MUSCLE_GROUP_LABELS[id]);
  if (limiterLabels.length === 0 && assetLabels.length === 0) {
    return "No clear muscle group pattern — focus on your biggest individual gap";
  }
  if (limiterLabels.length === 0) {
    return `Your ${assetLabels[0]} stations are consistently your strongest`;
  }
  const assetClause = assetLabels.length > 0
    ? allBelowBenchmark
      ? `; your ${assetLabels[0]} is your relative strength`
      : `; your ${assetLabels[0]} is a clear strength`
    : "";
  if (limiterLabels.length >= 2) {
    return `${limiterLabels[0]} and ${limiterLabels[1]} are the common thread across your weakest stations${assetClause}`;
  }
  return `${limiterLabels[0]} is the common thread across your weakest stations${assetClause}`;
}

function buildBody(stationClassifications, primaryLimiters, primaryAssets, allBelowBenchmark) {
  const weakStations = stationClassifications.filter((s) => s.relativeClass === "weak");
  const strongStations = stationClassifications.filter((s) => s.relativeClass === "strong");

  if (primaryLimiters.length === 0) {
    if (primaryAssets.length === 0) return null;
    return `${strongStations.map((s) => s.label).join(", ")} all draw heavily on ${MUSCLE_GROUP_LABELS[primaryAssets[0]]} — your most consistent performing group.`;
  }

  const limiterLabel = MUSCLE_GROUP_LABELS[primaryLimiters[0]];
  const parts = [
    `${weakStations.map((s) => s.label).join(", ")} — all relying heavily on ${limiterLabel} — are your lowest-ranked stations.`,
  ];

  if (primaryAssets.length > 0) {
    const assetLabel = MUSCLE_GROUP_LABELS[primaryAssets[0]];
    const strongList = strongStations.map((s) => s.label).join(", ");
    if (allBelowBenchmark) {
      parts.push(`${strongList} recruit ${assetLabel} and are your comparatively stronger stations — there is still ground to close to benchmark, but this is the foundation to build from.`);
    } else {
      parts.push(`By contrast, ${strongList} — driven by ${assetLabel} — are your strongest benchmarked stations.`);
    }
  }

  parts.push(`A targeted ${limiterLabel.toLowerCase()} strength-endurance block is the highest-leverage cross-station investment.`);
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

  // Limiter: appears in any weak station, with weak count meeting or exceeding strong count
  const primaryLimiters = Object.values(groupCounters)
    .filter((g) => g.weakCount > 0 && g.weakCount >= g.strongCount)
    .sort((a, b) => b.weakCount - a.weakCount || a.strongCount - b.strongCount)
    .slice(0, 2)
    .map((g) => g.groupId);

  // Asset: appears in any strong station, with strong count strictly exceeding weak count
  const primaryAssets = Object.values(groupCounters)
    .filter((g) => g.strongCount > 0 && g.strongCount > g.weakCount)
    .sort((a, b) => b.strongCount - a.strongCount || a.weakCount - b.weakCount)
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
      headline: buildHeadline(primaryLimiters, primaryAssets, allBelowBenchmark),
      body: buildBody(stationClassifications, primaryLimiters, primaryAssets, allBelowBenchmark),
      trainingHint: primaryLimiters[0] ? (TRAINING_HINTS[primaryLimiters[0]] ?? null) : null,
    },
  };
}
