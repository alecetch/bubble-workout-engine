import { penaltyContext } from "./penaltyContext.js";
import { reportLimiterGapSeconds, resolveReportLimiter } from "./reportSelections.js";

function fitnessLimiter(analysisJson = {}) {
  return resolveReportLimiter(analysisJson) ?? analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
}

function gapSeconds(analysisJson = {}, segment = {}) {
  return reportLimiterGapSeconds(analysisJson, segment, segment);
}

function positiveGapSegment(analysisJson = {}, segment = {}) {
  const seconds = gapSeconds(analysisJson, segment);
  return seconds != null && seconds > 0 ? { ...segment, timeGapSeconds: seconds } : null;
}

function byGapDesc(analysisJson = {}) {
  return (a, b) => (gapSeconds(analysisJson, b) ?? Number.NEGATIVE_INFINITY) - (gapSeconds(analysisJson, a) ?? Number.NEGATIVE_INFINITY);
}

function largestCategoryGap(analysisJson = {}) {
  return (analysisJson.segments ?? [])
    .filter((segment) => ["run_time", "work_time", "roxzone_time"].includes(segment.segmentKey))
    .map((segment) => positiveGapSegment(analysisJson, segment))
    .filter(Boolean)
    .sort(byGapDesc(analysisJson))[0] ?? null;
}

function largestSegmentGap(analysisJson = {}) {
  return (analysisJson.segments ?? [])
    .filter((segment) => segment.type === "run" || segment.type === "station" || segment.segmentKey === "roxzone_time")
    .map((segment) => positiveGapSegment(analysisJson, segment))
    .filter(Boolean)
    .sort(byGapDesc(analysisJson))[0] ?? null;
}

function penaltyFastestWin(penalty) {
  if (!penalty.penaltiesAreMaterial) return null;
  return {
    label: "Penalties",
    segmentKey: "penalties",
    type: "penalty",
    timeGapSeconds: penalty.totalPenaltySeconds,
    caption: "Fastest controllable win",
    isPrimary: Boolean(penalty.usePenaltyHero),
  };
}

export function opportunityFraming(analysisJson = {}) {
  const penalty = penaltyContext(analysisJson);
  const largestFitnessLimiter = fitnessLimiter(analysisJson);
  const fastestControllableWin = penaltyFastestWin(penalty);
  const largestCategory = largestCategoryGap(analysisJson);
  const largestSegment = largestSegmentGap(analysisJson);
  const primaryOpportunity = penalty.usePenaltyHero
    ? fastestControllableWin
    : largestFitnessLimiter ?? largestSegment ?? largestCategory ?? fastestControllableWin;
  const secondaryOpportunities = [fastestControllableWin, largestFitnessLimiter, largestSegment, largestCategory]
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((other) => (
      (other.segmentKey ?? other.label) === (item.segmentKey ?? item.label)
      && other.type === item.type
    )) === index)
    .filter((item) => (item.segmentKey ?? item.label) !== (primaryOpportunity?.segmentKey ?? primaryOpportunity?.label));

  return {
    penalty,
    fastestControllableWin,
    largestFitnessLimiter,
    largestCategoryGap: largestCategory,
    largestSegmentGap: largestSegment,
    primaryOpportunity,
    primaryDisplayOpportunity: primaryOpportunity,
    secondaryOpportunities,
    artifactHeadlineMode: penalty.usePenaltyHero
      ? "penalty_first"
      : fastestControllableWin
        ? "fitness_first_with_penalty_win"
        : "single_track",
    hasPenaltyDominantOpportunity: Boolean(penalty.usePenaltyHero),
  };
}
