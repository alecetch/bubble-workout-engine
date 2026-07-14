import { RUN_KEYS, ROXZONE_KEYS, STATION_KEYS } from "../config/segmentMap.js";
import { isIndividualAnalysisDivision } from "../config/divisionGroups.js";
import { VALIDATION_THRESHOLDS } from "../config/validationThresholds.js";

function result(pass, flag, severity = "warning", meta = {}) {
  return { pass, flag: pass ? null : flag, severity, ...meta };
}

function sumSegments(record, keys) {
  if (keys.some((key) => !Number.isFinite(record.segments?.[key]?.seconds))) return null;
  return keys.reduce((sum, key) => sum + record.segments[key].seconds, 0);
}

function consistencyRule({ actual, expected, warningSeconds, partialSeconds, failFlag, warningFlag, partialFlag }) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return result(false, failFlag, "warning", { delta: null, level: "missing" });
  }
  const delta = Math.abs(actual - expected);
  if (delta <= VALIDATION_THRESHOLDS.aggregateTolerance.passSeconds) {
    return { pass: true, flag: null, severity: "info", delta, level: "pass" };
  }
  if (delta <= warningSeconds) return result(false, warningFlag, "warning", { delta, level: "warning" });
  if (partialSeconds && delta <= partialSeconds) return result(false, partialFlag, "warning", { delta, level: "partial" });
  return result(false, failFlag, "error", { delta, level: "fail" });
}

export function V001_eventIdPresent(record) {
  return result(Boolean(record.event_id), "missing_event_id", "warning");
}

export function V002_eventNamePresent(record) {
  return result(Boolean(record.event_name), "missing_event_name", "warning");
}

export function V003_genderRecognised(record) {
  return result(record.gender !== "unknown", "invalid_gender", "error");
}

export function V004_ageGroupPresent(record) {
  return result(record.age_group !== "unknown", "unknown_age_group", "warning");
}

export function V005_divisionRecognised(record) {
  return result(record.division !== "unknown", "unknown_division", "warning");
}

export function V010_totalTimeValid(record) {
  return result(Number.isFinite(record.total_time_seconds) && record.total_time_seconds > 0, "invalid_total_time", "error");
}

export function V011_totalTimePlausible(record) {
  if (!isIndividualAnalysisDivision(record.division)) {
    return { pass: true, flag: null, severity: "info" };
  }
  const { individualMin, individualMax } = VALIDATION_THRESHOLDS.totalTime;
  const seconds = record.total_time_seconds;
  return result(Number.isFinite(seconds) && seconds >= individualMin && seconds <= individualMax, "total_time_outside_individual_range", "warning");
}

export function V020_totalAggregateConsistency(record) {
  const expected = [record.run_time_seconds, record.work_time_seconds, record.roxzone_time_seconds].every(Number.isFinite)
    ? record.run_time_seconds + record.work_time_seconds + record.roxzone_time_seconds
    : null;
  return consistencyRule({
    actual: record.total_time_seconds,
    expected,
    warningSeconds: VALIDATION_THRESHOLDS.aggregateTolerance.warningSeconds,
    partialSeconds: VALIDATION_THRESHOLDS.aggregateTolerance.totalPartialSeconds,
    warningFlag: "total_sum_mismatch_warning",
    partialFlag: "total_sum_mismatch_partial",
    failFlag: "total_sum_mismatch_fail",
  });
}

export function V021_runSplitSumConsistency(record) {
  return consistencyRule({
    actual: record.run_time_seconds,
    expected: sumSegments(record, RUN_KEYS),
    warningSeconds: VALIDATION_THRESHOLDS.aggregateTolerance.warningSeconds,
    partialSeconds: null,
    warningFlag: "run_split_sum_mismatch_warning",
    failFlag: "run_split_sum_mismatch_fail",
  });
}

export function V022_workSplitSumConsistency(record) {
  return consistencyRule({
    actual: record.work_time_seconds,
    expected: sumSegments(record, STATION_KEYS),
    warningSeconds: VALIDATION_THRESHOLDS.aggregateTolerance.warningSeconds,
    partialSeconds: null,
    warningFlag: "work_split_sum_mismatch_warning",
    failFlag: "work_split_sum_mismatch_fail",
  });
}

export function V023_roxzoneSplitSumConsistency(record) {
  return consistencyRule({
    actual: record.roxzone_time_seconds,
    expected: sumSegments(record, ROXZONE_KEYS),
    warningSeconds: VALIDATION_THRESHOLDS.aggregateTolerance.roxzoneWarningSeconds,
    partialSeconds: null,
    warningFlag: "roxzone_split_sum_mismatch_warning",
    failFlag: "roxzone_split_sum_mismatch_fail",
  });
}

export const VALIDATION_RULES = Object.freeze([
  V001_eventIdPresent,
  V002_eventNamePresent,
  V003_genderRecognised,
  V004_ageGroupPresent,
  V005_divisionRecognised,
  V010_totalTimeValid,
  V011_totalTimePlausible,
  V020_totalAggregateConsistency,
  V021_runSplitSumConsistency,
  V022_workSplitSumConsistency,
  V023_roxzoneSplitSumConsistency,
]);
