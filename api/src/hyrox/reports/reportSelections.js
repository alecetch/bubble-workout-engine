import { STATION_KEYS } from "../config/segmentMap.js";
import { formatGain } from "./copyFormatter.js";
import { penaltyContext } from "./penaltyContext.js";

function isNonBlank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function segment(analysisJson, key) {
  return (analysisJson?.segments ?? []).find((row) => row?.segmentKey === key) ?? null;
}

function isStationStrength(row, candidate) {
  const type = row?.type ?? candidate?.type ?? null;
  return type === "station" || STATION_KEYS.includes(row?.segmentKey) || STATION_KEYS.includes(candidate?.segmentKey);
}

function normaliseKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function segmentPenaltySeconds(analysisJson = {}, row = {}, candidate = {}) {
  const keys = [
    row.segmentKey,
    candidate.segmentKey,
    row.label,
    candidate.label,
  ].filter(Boolean).map(normaliseKey);
  if (keys.length === 0) return 0;
  return (Array.isArray(analysisJson.penalties) ? analysisJson.penalties : [])
    .reduce((sum, penalty) => {
      const penaltyKeys = [
        penalty.segmentKey,
        penalty.runKey,
        penalty.station,
        penalty.label,
        penalty.rawText,
      ].filter(Boolean).map(normaliseKey);
      return penaltyKeys.some((penaltyKey) => keys.some((key) => (
        penaltyKey === key
        || penaltyKey.startsWith(`${key}_`)
        || key.startsWith(`${penaltyKey}_`)
      )))
        ? sum + (Number(penalty?.penaltySeconds) || 0)
        : sum;
    }, 0);
}

function aggregatePenaltySeconds(analysisJson = {}, segmentKey = null) {
  if (segmentKey !== "run_time" && segmentKey !== "work_time" && segmentKey !== "total_time") return null;
  return (Array.isArray(analysisJson.penalties) ? analysisJson.penalties : [])
    .reduce((sum, penalty) => {
      const key = normaliseKey(penalty.segmentKey ?? penalty.runKey ?? penalty.station ?? penalty.label);
      const seconds = Number(penalty?.penaltySeconds) || 0;
      if (segmentKey === "total_time") return sum + seconds;
      if (segmentKey === "run_time") return /^run_[1-8]$/.test(key) ? sum + seconds : sum;
      if (segmentKey === "work_time") return key && !/^run_[1-8]$/.test(key) ? sum + seconds : sum;
      return sum;
    }, 0);
}

function isPlainStrengthEligible(analysisJson = {}, row = {}, candidate = {}) {
  const penalty = penaltyContext(analysisJson);
  if (!penalty.penaltiesAreMaterial) return true;
  return segmentPenaltySeconds(analysisJson, row, candidate) < 60;
}

function isImpossibleFastStrength(row = {}) {
  const gap = reportStrengthGapSeconds(row);
  const userSeconds = Number(row?.userSeconds);
  if (!Number.isFinite(gap) || !Number.isFinite(userSeconds) || userSeconds <= 0 || gap >= 0) return false;
  const comparisonSeconds = userSeconds - gap;
  return Number.isFinite(comparisonSeconds)
    && comparisonSeconds >= 30
    && userSeconds <= Math.min(10, comparisonSeconds * 0.1);
}

export function reportStrengthGapSeconds(row = {}) {
  if (Number.isFinite(row?.frameGapNetOfPenaltySeconds)) return Number(row.frameGapNetOfPenaltySeconds);
  if (Number.isFinite(row?.frameGapSeconds)) return Number(row.frameGapSeconds);
  if (Number.isFinite(row?.timeGapToExactTargetSeconds)) return Number(row.timeGapToExactTargetSeconds);
  if (Number.isFinite(row?.timeGapToMedianSeconds)) return Number(row.timeGapToMedianSeconds);
  if (Number.isFinite(row?.timeAdvantageSeconds)) return -Math.abs(Number(row.timeAdvantageSeconds));
  return null;
}

export function reportStrengthSummaryText(strength) {
  const gap = reportStrengthGapSeconds(strength);
  if (Number.isFinite(gap) && gap < 0) return `Ahead by ${formatGain(gap)}`;
  if (Number.isFinite(gap) && gap === 0) return "On comparison";
  return "Best benchmarked split";
}

export function reportLimiterGapSeconds(analysisJson = {}, row = {}, candidate = {}) {
  const netValue = row.frameGapNetOfPenaltySeconds
    ?? row.timeGapToExactTargetSecondsNetOfPenalty
    ?? row.timeGapToNextBandMedianSecondsNetOfPenalty
    ?? row.timeGapToMedianSecondsNetOfPenalty
    ?? candidate.frameGapNetOfPenaltySeconds
    ?? candidate.timeGapToExactTargetSecondsNetOfPenalty
    ?? candidate.timeGapToNextBandMedianSecondsNetOfPenalty
    ?? candidate.timeGapToMedianSecondsNetOfPenalty;
  if (Number.isFinite(Number(netValue))) return Number(netValue);

  const rawValue = row.frameGapSeconds
    ?? row.timeGapSeconds
    ?? row.timeGapToExactTargetSeconds
    ?? row.timeGapToNextBandMedianSeconds
    ?? row.timeGapToMedianSeconds
    ?? candidate.frameGapSeconds
    ?? candidate.timeGapSeconds
    ?? candidate.timeGapToExactTargetSeconds
    ?? candidate.timeGapToNextBandMedianSeconds
    ?? candidate.timeGapToMedianSeconds;
  const rawSeconds = Number(rawValue);
  if (!Number.isFinite(rawSeconds)) return null;

  const penalty = penaltyContext(analysisJson);
  if (!penalty.penaltiesAreMaterial) return rawSeconds;
  const aggregatePenalty = aggregatePenaltySeconds(analysisJson, row.segmentKey ?? candidate.segmentKey);
  return rawSeconds - (aggregatePenalty ?? segmentPenaltySeconds(analysisJson, row, candidate));
}

export function resolveReportLimiter(analysisJson = {}) {
  const byKey = new Map((analysisJson.segments ?? [])
    .filter((row) => row?.segmentKey)
    .map((row) => [row.segmentKey, row]));
  const explicitCandidates = [
    analysisJson.headline?.biggestLimiter,
    ...(Array.isArray(analysisJson.limiters) ? analysisJson.limiters : []),
  ].filter(Boolean);
  const resolveCandidate = (candidate) => {
    const key = candidate.segmentKey;
    const row = key ? byKey.get(key) : null;
    const mergedType = row?.type ?? candidate.type;
    if (!(mergedType === "run" || mergedType === "station" || key === "roxzone_time")) return null;
    const gap = reportLimiterGapSeconds(analysisJson, row ?? {}, candidate);
    if (!Number.isFinite(gap) || gap <= 0) return null;
    const label = isNonBlank(candidate.label) ? candidate.label.trim() : isNonBlank(row?.label) ? row.label.trim() : null;
    if (!label || !key) return null;
    return { ...row, ...candidate, label, segmentKey: key, type: mergedType, timeGapSeconds: gap };
  };

  for (const candidate of explicitCandidates) {
    const resolved = resolveCandidate(candidate);
    if (resolved) return resolved;
  }

  const candidates = Array.isArray(analysisJson.segments) ? analysisJson.segments : [];
  const ranked = [];

  for (const candidate of candidates) {
    const resolved = resolveCandidate(candidate);
    if (resolved) ranked.push(resolved);
  }

  return ranked
    .filter((item, index, list) => list.findIndex((other) => other.segmentKey === item.segmentKey) === index)
    .sort((a, b) => Number(b.timeGapSeconds) - Number(a.timeGapSeconds))[0] ?? null;
}

export function dataQualityNote(analysisJson = {}) {
  const warnings = analysisJson.dataQuality?.warnings ?? [];
  const completeness = Number(analysisJson.dataQuality?.inputCompleteness);
  if (warnings.includes("partial_split_data") || (Number.isFinite(completeness) && completeness < 1)) {
    return "Some run or station split data is missing, so this summary is directional.";
  }
  return null;
}

export function resolveReportStrength(analysisJson = {}) {
  const candidates = [
    ...(Array.isArray(analysisJson.strengths) ? analysisJson.strengths : []),
    analysisJson.headline?.biggestStrength,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!isNonBlank(candidate.segmentKey)) continue;
    const row = segment(analysisJson, candidate.segmentKey);
    if (!row || !isStationStrength(row, candidate) || !Number.isFinite(row.userSeconds)) continue;
    if (isImpossibleFastStrength({ ...row, ...candidate })) continue;
    if (!isPlainStrengthEligible(analysisJson, row, candidate)) continue;
    const label = isNonBlank(candidate.label) ? candidate.label.trim() : isNonBlank(row.label) ? row.label.trim() : null;
    if (!label) continue;
    const merged = { ...row, ...candidate, label, segmentKey: candidate.segmentKey };
    return {
      ...merged,
      summaryText: reportStrengthSummaryText(merged),
      dataQualityNote: dataQualityNote(analysisJson),
    };
  }

  return null;
}
