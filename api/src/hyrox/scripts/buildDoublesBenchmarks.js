#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../../db.js";
import { BENCHMARK_METRIC_KEYS, computeBenchmarkStats } from "../benchmarks/computeBenchmarkStats.js";
import { HYROX_SCRAPER_DIVISIONS } from "../doubles/doublesScraper.js";

const DATASET_VERSION = "doubles_v1";
const DOUBLES_BENCHMARK_DIVISIONS = Object.freeze([
  "doubles_male",
  "doubles_female",
  "doubles_mixed",
  "pro_doubles_male",
  "pro_doubles_female",
  "pro_doubles_mixed",
]);
const DIVISIONS = HYROX_SCRAPER_DIVISIONS.filter((division) => DOUBLES_BENCHMARK_DIVISIONS.includes(division));
const MIN_SPLIT_COVERAGE_SCORE = 0.8;
const MIN_GROUP_SAMPLE_SIZE = 100;

function groupKey(division) {
  return `hyrox:${DATASET_VERSION}:${division}:all:all`;
}

function toFiniteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

export function adaptEnrichedRow(row) {
  const includeSegments = Number(row.split_coverage_score ?? 0) >= MIN_SPLIT_COVERAGE_SCORE;
  return {
    _division: row.division_category,
    total_time_seconds: toFiniteOrNull(row.overall_time_seconds),
    run_time_seconds: toFiniteOrNull(row.run_total_seconds),
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

function buildGroups(adaptedRows) {
  return DIVISIONS.map((division) => {
    const records = adaptedRows.filter((row) => row._division === division);
    return {
      groupKey: groupKey(division),
      datasetVersion: DATASET_VERSION,
      division,
      gender: "all",
      ageGroup: "all",
      performanceBand: null,
      fallbackLevel: 0,
      sampleSize: records.length,
      records,
    };
  }).filter((group) => group.sampleSize >= MIN_GROUP_SAMPLE_SIZE);
}

async function upsertGroup(client, group) {
  await client.query(
    `INSERT INTO hyrox_benchmark_groups
      (group_key, dataset_version, division, gender, age_group, performance_band, fallback_level, sample_size)
     VALUES ($1, $2, $3, 'all', 'all', NULL, 0, $4)
     ON CONFLICT (group_key) DO UPDATE SET
       sample_size = EXCLUDED.sample_size`,
    [group.groupKey, group.datasetVersion, group.division, group.sampleSize],
  );
}

async function upsertMetric(client, metric) {
  await client.query(
    `INSERT INTO hyrox_benchmark_metrics
      (group_key, metric_key, sample_size, mean_seconds, median_seconds, stddev_seconds,
       p10_seconds, p25_seconds, p50_seconds, p75_seconds, p90_seconds, p95_seconds, p99_seconds,
       cv, iqr_seconds, missingness_rate, outlier_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (group_key, metric_key) DO UPDATE SET
       sample_size = EXCLUDED.sample_size,
       mean_seconds = EXCLUDED.mean_seconds,
       median_seconds = EXCLUDED.median_seconds,
       stddev_seconds = EXCLUDED.stddev_seconds,
       p10_seconds = EXCLUDED.p10_seconds,
       p25_seconds = EXCLUDED.p25_seconds,
       p50_seconds = EXCLUDED.p50_seconds,
       p75_seconds = EXCLUDED.p75_seconds,
       p90_seconds = EXCLUDED.p90_seconds,
       p95_seconds = EXCLUDED.p95_seconds,
       p99_seconds = EXCLUDED.p99_seconds,
       cv = EXCLUDED.cv,
       iqr_seconds = EXCLUDED.iqr_seconds,
       missingness_rate = EXCLUDED.missingness_rate,
       outlier_rate = EXCLUDED.outlier_rate`,
    [
      metric.groupKey,
      metric.metricKey,
      metric.sampleSize,
      metric.meanSeconds,
      metric.medianSeconds,
      metric.stddevSeconds,
      metric.p10Seconds,
      metric.p25Seconds,
      metric.p50Seconds,
      metric.p75Seconds,
      metric.p90Seconds,
      metric.p95Seconds,
      metric.p99Seconds,
      metric.cv,
      metric.iqrSeconds,
      metric.missingnessRate,
      metric.outlierRate,
    ],
  );
}

export async function buildDoublesBenchmarks() {
  const { rows } = await pool.query(
    `SELECT
       division_category,
       overall_time_seconds,
       run_total_seconds,
       station_total_seconds,
       roxzone_total_seconds,
       split_run_1, split_run_2, split_run_3, split_run_4,
       split_run_5, split_run_6, split_run_7, split_run_8,
       split_skierg, split_sled_push, split_sled_pull, split_burpee_bj,
       split_row, split_farmers_carry, split_sandbag_lunge, split_wall_balls,
       rox_skierg_in, rox_skierg_out,
       rox_sled_push_in, rox_sled_push_out,
       rox_sled_pull_in, rox_sled_pull_out,
       rox_burpee_bj_in, rox_burpee_bj_out,
       rox_row_in, rox_row_out,
       rox_farmers_carry_in, rox_farmers_carry_out,
       rox_sandbag_lunge_in, rox_sandbag_lunge_out,
       split_coverage_score
     FROM hyrox_doubles_scraped_results
       WHERE data_quality_status IN ('valid','partial')
       AND overall_time_seconds IS NOT NULL
     ORDER BY division_category, overall_time_seconds`,
  );
  const adaptedRows = rows.map(adaptEnrichedRow);
  const groups = buildGroups(adaptedRows);
  const metrics = computeBenchmarkStats(groups, BENCHMARK_METRIC_KEYS);
  const metricsByGroup = new Map(groups.map((group) => [group.groupKey, metrics.filter((metric) => metric.groupKey === group.groupKey)]));

  const written = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const retainedGroupKeys = groups.map((group) => group.groupKey);
    if (retainedGroupKeys.length) {
      await client.query(
        `DELETE FROM hyrox_benchmark_metrics
         WHERE group_key IN (
           SELECT group_key FROM hyrox_benchmark_groups
           WHERE dataset_version = $1
             AND group_key <> ALL($2::text[])
         )`,
        [DATASET_VERSION, retainedGroupKeys],
      );
      await client.query(
        `DELETE FROM hyrox_benchmark_groups
         WHERE dataset_version = $1
           AND group_key <> ALL($2::text[])`,
        [DATASET_VERSION, retainedGroupKeys],
      );
    } else {
      await client.query(
        `DELETE FROM hyrox_benchmark_metrics
         WHERE group_key IN (
           SELECT group_key FROM hyrox_benchmark_groups
           WHERE dataset_version = $1
         )`,
        [DATASET_VERSION],
      );
      await client.query("DELETE FROM hyrox_benchmark_groups WHERE dataset_version = $1", [DATASET_VERSION]);
    }
    for (const group of groups) {
      await upsertGroup(client, group);
      const groupMetrics = metricsByGroup.get(group.groupKey) ?? [];
      for (const metric of groupMetrics) await upsertMetric(client, metric);
      written.push({ groupKey: group.groupKey, sampleSize: group.sampleSize, metricCount: groupMetrics.length });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { rowsProcessed: rows.length, metricCount: metrics.length, written };
}

function printSummary(summary) {
  console.log("HYROX doubles benchmark build complete");
  console.log(`rows_processed: ${summary.rowsProcessed}`);
  console.log(`metrics_written: ${summary.metricCount}`);
  for (const group of summary.written) {
    console.log(`${group.groupKey}: ${group.sampleSize} rows, ${group.metricCount} metrics`);
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  buildDoublesBenchmarks()
    .then(printSummary)
    .catch((err) => {
      console.error(err?.stack || err?.message || err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
