import { formatSecondsToTime } from "../ingestion/timeParser.js";

export function getUserLabel(grade) {
  if (grade === "C") return "Moderate confidence";
  if (grade === "D") return "Limited confidence";
  if (grade === "E") return null;
  return null;
}

export function getCopyPrefix(grade) {
  if (grade === "B") return "Your data suggests...";
  if (grade === "C") return "Based on available data...";
  if (grade === "D") return "This is worth reviewing, but data is limited.";
  return "";
}

function minutesRange(lowSeconds, highSeconds) {
  const low = Math.max(1, Math.round(lowSeconds / 60));
  const high = Math.max(low, Math.round(highSeconds / 60));
  return `${low}-${high} minutes`;
}

export function getImprovementOpportunityCopy(estimatedGainSeconds, rangeLowSeconds, rangeHighSeconds, grade, station = "This area") {
  if (grade === "E") return null;
  if (grade === "A" || grade === "B") return `Potential gain: ${formatSecondsToTime(estimatedGainSeconds)}`;
  if (grade === "C") return `Estimated opportunity: around ${minutesRange(rangeLowSeconds, rangeHighSeconds)}`;
  if (grade === "D") return `${station} appears to be an opportunity, but benchmark confidence is limited.`;
  return null;
}
