import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_MAP, TRAINING_HINTS } from "../config/muscleGroupMap.js";

const MAP_BY_KEY = new Map(MUSCLE_GROUP_MAP.map((entry) => [entry.segmentKey, entry]));

function classifyPercentile(percentile) {
  if (!Number.isFinite(percentile)) return "neutral";
  if (percentile < 40) return "weak";
  if (percentile > 60) return "strong";
  return "neutral";
}

function buildHeadline(primaryLimiters, primaryAssets) {
  const limiterLabels = primaryLimiters.map((id) => MUSCLE_GROUP_LABELS[id]);
  const assetLabels = primaryAssets.map((id) => MUSCLE_GROUP_LABELS[id]);
  if (limiterLabels.length === 0 && assetLabels.length === 0) return "No clear muscle group pattern - focus on your biggest individual gap";
  if (limiterLabels.length === 0) return `Your ${assetLabels[0]} stations are consistently strong`;
  if (limiterLabels.length >= 2) return `${limiterLabels[0]} and ${limiterLabels[1]} are the common thread across your weakest stations`;
  if (assetLabels.length === 0) return `${limiterLabels[0]} is the common thread across your weakest stations`;
  return `${limiterLabels[0]} limits your weakest stations; your ${assetLabels[0]} is a clear strength`;
}

function buildBody(stationClassifications, primaryLimiters, primaryAssets) {
  const weakStations = stationClassifications.filter((station) => station.classification === "weak").map((station) => station.label);
  const strongStations = stationClassifications.filter((station) => station.classification === "strong").map((station) => station.label);
  if (primaryLimiters.length === 0) {
    if (primaryAssets.length === 0) return null;
    const assetLabel = MUSCLE_GROUP_LABELS[primaryAssets[0]];
    return `${strongStations.join(", ")} all recruit the ${assetLabel} as a primary driver - an area where you have a meaningful advantage over your benchmark group.`;
  }
  const limiterLabel = MUSCLE_GROUP_LABELS[primaryLimiters[0]];
  const parts = [`${weakStations.join(", ")} - all heavily reliant on the ${limiterLabel} - sit below the 40th percentile.`];
  if (primaryAssets.length > 0) {
    parts.push(`By contrast, your ${MUSCLE_GROUP_LABELS[primaryAssets[0]]} events (${strongStations.join(", ")}) are well above benchmark.`);
  }
  parts.push(`A targeted ${limiterLabel.toLowerCase()} strength-endurance block is likely the highest-leverage cross-station investment.`);
  return parts.join(" ");
}

export function analyseMuscleGroups(analysisResult = {}) {
  if (analysisResult.analysisScope === "limited") return { available: false };
  const stations = (analysisResult.stationBreakdown ?? []).filter(
    (station) => station.confidence !== "low" && MAP_BY_KEY.has(station.segmentKey),
  );
  if (stations.length < 3) return { available: false };

  const stationClassifications = stations.map((station) => {
    const mapping = MAP_BY_KEY.get(station.segmentKey);
    return {
      segmentKey: station.segmentKey,
      label: station.label,
      classification: classifyPercentile(station.percentile),
      percentile: station.percentile,
      primaryGroups: mapping.primary,
    };
  });

  const weakCount = stationClassifications.filter((station) => station.classification === "weak").length;
  const strongCount = stationClassifications.filter((station) => station.classification === "strong").length;
  if (weakCount === 0 && strongCount === 0) {
    return {
      available: true,
      patternFound: false,
      stationCount: stations.length,
      stationClassifications,
      muscleGroupSignals: [],
      primaryLimiters: [],
      primaryAssets: [],
      conclusion: {
        headline: "No clear muscle group pattern - focus on your biggest individual gap",
        body: null,
        trainingHint: null,
      },
    };
  }

  const groupCounters = {};
  for (const groupId of Object.keys(MUSCLE_GROUP_LABELS)) {
    groupCounters[groupId] = { groupId, label: MUSCLE_GROUP_LABELS[groupId], weakCount: 0, strongCount: 0 };
  }
  for (const station of stationClassifications) {
    for (const groupId of station.primaryGroups) {
      if (station.classification === "weak") groupCounters[groupId].weakCount += 1;
      if (station.classification === "strong") groupCounters[groupId].strongCount += 1;
    }
  }

  const muscleGroupSignals = Object.values(groupCounters).map((counter) => {
    let signal = "neutral";
    if (counter.weakCount >= 2 && counter.weakCount > counter.strongCount) signal = "limiter";
    else if (counter.strongCount >= 2 && counter.strongCount > counter.weakCount) signal = "asset";
    else if (counter.weakCount >= 1 && counter.strongCount >= 1) signal = "mixed";
    return { ...counter, signal };
  });
  const rankedLimiters = muscleGroupSignals
    .filter((group) => group.signal === "limiter")
    .sort((a, b) => b.weakCount - a.weakCount || a.strongCount - b.strongCount);
  const limiters = rankedLimiters
    .filter((group, index, groups) => index === 0 || group.weakCount === groups[0].weakCount)
    .slice(0, 2);
  const assets = muscleGroupSignals
    .filter((group) => group.signal === "asset")
    .sort((a, b) => b.strongCount - a.strongCount || a.weakCount - b.weakCount)
    .slice(0, 1);
  const primaryLimiters = limiters.map((group) => group.groupId);
  const primaryAssets = assets.map((group) => group.groupId);
  const headline = buildHeadline(primaryLimiters, primaryAssets);
  const body = buildBody(stationClassifications, primaryLimiters, primaryAssets);
  const trainingHint = primaryLimiters[0] ? TRAINING_HINTS[primaryLimiters[0]] ?? null : null;

  return {
    available: true,
    patternFound: true,
    stationCount: stations.length,
    stationClassifications,
    muscleGroupSignals,
    primaryLimiters,
    primaryAssets,
    conclusion: { headline, body, trainingHint },
  };
}
