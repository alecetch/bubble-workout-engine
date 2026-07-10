import { countryToRegion } from "../config/regionMapping.js";

const MIN_SPLIT_COVERAGE_SCORE = 0.8;

export const PERFORMANCE_BANDS = Object.freeze([
  ...[60, 65, 70, 75, 80, 90, 105].map((threshold) => `sub_${threshold}`),
  "over_105",
]);

export const AGE_GROUP_WHITELIST = new Set([
  "16-24", "25-29", "30-34", "35-39", "40-44", "45-49",
  "50-54", "55-59", "60-64", "65-69", "70-74", "75-79",
  "80-84", "85-89", "90+",
]);

export function toFiniteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function performanceBandForSeconds(seconds) {
  const numeric = toFiniteOrNull(seconds);
  if (numeric === null) return null;
  const minutes = numeric / 60;
  for (const threshold of [60, 65, 70, 75, 80, 90, 105]) {
    if (minutes <= threshold) return `sub_${threshold}`;
  }
  return "over_105";
}

export function sumOrNull(a, b) {
  const left = toFiniteOrNull(a);
  const right = toFiniteOrNull(b);
  return left !== null && right !== null ? left + right : null;
}

function segment(seconds) {
  return { seconds: toFiniteOrNull(seconds) };
}

function filteredSegment(row, column, includeSegments) {
  return segment(includeSegments ? row[column] : null);
}

function filteredRoxzone(row, inColumn, outColumn, includeSegments) {
  return segment(includeSegments ? sumOrNull(row[inColumn], row[outColumn]) : null);
}

function flagsFromRow(row) {
  const value = row.data_quality_flags;
  if (Array.isArray(value)) return new Set(value.map(String));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return new Set(parsed.map(String));
    } catch {
      return new Set(value.split(",").map((flag) => flag.trim()).filter(Boolean));
    }
  }
  return new Set();
}

function rowHasUnsafeRunTotal(row) {
  const flags = flagsFromRow(row);
  if (flags.has("incomplete_run_splits") || flags.has("missing_run_total")) return true;
  const runValues = [
    row.split_run_1, row.split_run_2, row.split_run_3, row.split_run_4,
    row.split_run_5, row.split_run_6, row.split_run_7, row.split_run_8,
  ].map(toFiniteOrNull).filter((value) => value !== null);
  const runTotal = toFiniteOrNull(row.run_total_seconds);
  if (runValues.length === 0 || runValues.length === 8 || runTotal === null) return false;
  const partialSum = runValues.reduce((sum, value) => sum + value, 0);
  return Math.abs(partialSum - runTotal) <= 1;
}

export function isBenchmarkSourceRowEligible(row) {
  const total = toFiniteOrNull(row.overall_time_seconds);
  const name = String(row.athlete_1_name ?? "");
  return total !== null
    && total >= 2700
    && total <= 28800
    && !/^test/i.test(name);
}

export function adaptEnrichedRow(row) {
  const includeSegments = Number(row.split_coverage_score ?? 0) >= MIN_SPLIT_COVERAGE_SCORE;
  const totalTimeSeconds = toFiniteOrNull(row.overall_time_seconds);
  const runTimeSeconds = rowHasUnsafeRunTotal(row) ? null : toFiniteOrNull(row.run_total_seconds);
  return {
    _division: row.division_category,
    _performanceBand: performanceBandForSeconds(totalTimeSeconds),
    _ageGroup: row.age_group ?? null,
    _region: countryToRegion(row.event_country) ?? null,
    total_time_seconds: totalTimeSeconds,
    run_time_seconds: runTimeSeconds,
    work_time_seconds: toFiniteOrNull(row.station_total_seconds),
    roxzone_time_seconds: toFiniteOrNull(row.roxzone_total_seconds),
    segments: {
      run_1: filteredSegment(row, "split_run_1", includeSegments),
      run_2: filteredSegment(row, "split_run_2", includeSegments),
      run_3: filteredSegment(row, "split_run_3", includeSegments),
      run_4: filteredSegment(row, "split_run_4", includeSegments),
      run_5: filteredSegment(row, "split_run_5", includeSegments),
      run_6: filteredSegment(row, "split_run_6", includeSegments),
      run_7: filteredSegment(row, "split_run_7", includeSegments),
      run_8: filteredSegment(row, "split_run_8", includeSegments),
      ski_erg: filteredSegment(row, "split_skierg", includeSegments),
      sled_push: filteredSegment(row, "split_sled_push", includeSegments),
      sled_pull: filteredSegment(row, "split_sled_pull", includeSegments),
      burpee_broad_jump: filteredSegment(row, "split_burpee_bj", includeSegments),
      row: filteredSegment(row, "split_row", includeSegments),
      farmers_carry: filteredSegment(row, "split_farmers_carry", includeSegments),
      sandbag_lunges: filteredSegment(row, "split_sandbag_lunge", includeSegments),
      wall_balls: filteredSegment(row, "split_wall_balls", includeSegments),
      roxzone_1: filteredRoxzone(row, "rox_skierg_in", "rox_skierg_out", includeSegments),
      roxzone_2: filteredRoxzone(row, "rox_sled_push_in", "rox_sled_push_out", includeSegments),
      roxzone_3: filteredRoxzone(row, "rox_sled_pull_in", "rox_sled_pull_out", includeSegments),
      roxzone_4: filteredRoxzone(row, "rox_burpee_bj_in", "rox_burpee_bj_out", includeSegments),
      roxzone_5: filteredRoxzone(row, "rox_row_in", "rox_row_out", includeSegments),
      roxzone_6: filteredRoxzone(row, "rox_farmers_carry_in", "rox_farmers_carry_out", includeSegments),
      roxzone_7: filteredRoxzone(row, "rox_sandbag_lunge_in", "rox_sandbag_lunge_out", includeSegments),
      roxzone_8: segment(null),
    },
  };
}

export function adaptEligibleEnrichedRows(rows) {
  return rows.filter(isBenchmarkSourceRowEligible).map(adaptEnrichedRow);
}
