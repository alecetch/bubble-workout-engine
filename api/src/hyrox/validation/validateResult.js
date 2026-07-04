import { RUN_KEYS, ROXZONE_KEYS, STATION_KEYS } from "../config/segmentMap.js";
import { INDIVIDUAL_BENCHMARK_DIVISIONS, VALIDATION_THRESHOLDS } from "../config/validationThresholds.js";
import { VALIDATION_RULES } from "./validationRules.js";

function isFiniteSeconds(value) {
  return Number.isFinite(value) && value >= 0;
}

function allSegmentsPresent(record, keys) {
  return keys.every((key) => isFiniteSeconds(record.segments?.[key]?.seconds));
}

function plausibilityFlags(record) {
  const flags = [];
  const thresholds = record.division === "doubles"
    ? VALIDATION_THRESHOLDS.doublesPlausibility
    : VALIDATION_THRESHOLDS.plausibility;

  for (const [key, segment] of Object.entries(record.segments ?? {})) {
    const seconds = segment?.seconds;
    const threshold = thresholds[key];
    if (!threshold || seconds === null || seconds === undefined) continue;
    if (!Number.isFinite(seconds) || seconds < threshold.min || seconds > threshold.max) {
      flags.push(`plausibility_${key}`);
    }
  }

  const rox = record.roxzone_time_seconds;
  const roxThreshold = thresholds.roxzone_time;
  if (rox !== null && rox !== undefined && (!Number.isFinite(rox) || rox < roxThreshold.min || rox > roxThreshold.max)) {
    flags.push("plausibility_roxzone_time");
  }

  return flags;
}

function deriveStatus({ ruleResults, flags, record, benchmarkEligibility }) {
  if (ruleResults.some((r) => r.flag === "invalid_total_time" || r.flag === "invalid_gender")) return "fail";
  if (ruleResults.some((r) => r.flag === "total_time_outside_individual_range")) return "quarantine";
  if (record.age_group === "unknown") return "partial";
  if (!benchmarkEligibility.run || !benchmarkEligibility.station || !benchmarkEligibility.roxzone) return "partial";
  if (flags.length > 0) return "warning";
  return "pass";
}

function scoreResult({ record, ruleResults, flags, benchmarkEligibility }) {
  let score = 0;
  if (record.event_id && record.event_name && record.gender !== "unknown" && record.division !== "unknown") score += 20;
  if (isFiniteSeconds(record.total_time_seconds) && record.total_time_seconds > 0) score += 20;
  if (!["total_sum_mismatch_partial", "total_sum_mismatch_fail"].some((flag) => flags.includes(flag))) score += 20;
  if (benchmarkEligibility.run && benchmarkEligibility.station && benchmarkEligibility.roxzone) score += 20;
  if (!flags.some((flag) => flag.startsWith("plausibility_"))) score += 10;
  if (!flags.some((flag) => flag.startsWith("duplicate_") || flag.startsWith("outlier_"))) score += 10;

  if (ruleResults.some((r) => r.severity === "error" && r.flag)) score = Math.min(score, 40);
  if (record.age_group === "unknown") score = Math.min(score, 80);
  return Math.max(0, Math.min(100, score));
}

export function validateResult(record, options = {}) {
  const ruleResults = VALIDATION_RULES.map((rule) => rule(record));
  const flags = [...new Set(ruleResults.map((r) => r.flag).filter(Boolean).concat(plausibilityFlags(record)))];

  const individualDivision = INDIVIDUAL_BENCHMARK_DIVISIONS.includes(record.division);
  const validTotal = isFiniteSeconds(record.total_time_seconds) && record.total_time_seconds > 0 && record.gender !== "unknown";
  const runConsistent = !flags.includes("run_split_sum_mismatch_fail") && allSegmentsPresent(record, RUN_KEYS) && isFiniteSeconds(record.run_time_seconds);
  const stationConsistent = !flags.includes("work_split_sum_mismatch_fail") && allSegmentsPresent(record, STATION_KEYS) && isFiniteSeconds(record.work_time_seconds);
  const roxzoneConsistent = !flags.includes("roxzone_split_sum_mismatch_fail") && allSegmentsPresent(record, ROXZONE_KEYS) && isFiniteSeconds(record.roxzone_time_seconds);

  const benchmarkEligibility = {
    overall: validTotal && individualDivision,
    run: validTotal && individualDivision && runConsistent,
    station: validTotal && individualDivision && stationConsistent,
    roxzone: validTotal && individualDivision && roxzoneConsistent,
    fullDetail: validTotal && individualDivision && runConsistent && stationConsistent && roxzoneConsistent,
    ageGroup: validTotal && individualDivision && record.age_group !== "unknown",
  };

  const status = deriveStatus({ ruleResults, flags, record, benchmarkEligibility });
  const qualityScore = scoreResult({ record, ruleResults, flags, benchmarkEligibility });

  return {
    status,
    qualityScore,
    flags,
    benchmarkEligibility,
    ruleResults,
    consistency: Object.fromEntries(
      ruleResults
        .filter((r) => Object.hasOwn(r, "delta"))
        .map((r) => [r.flag ?? "pass", { delta: r.delta, level: r.level }]),
    ),
    duplicates: options.duplicates ?? null,
  };
}
