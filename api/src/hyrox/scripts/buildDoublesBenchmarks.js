#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../../db.js";
import { BENCHMARK_METRIC_KEYS, computeBenchmarkStats } from "../benchmarks/computeBenchmarkStats.js";
import { HYROX_SCRAPER_DIVISIONS } from "../doubles/doublesScraper.js";
import {
  AGE_GROUP_WHITELIST,
  PERFORMANCE_BANDS,
  adaptEligibleEnrichedRows,
  adaptEnrichedRow,
  isBenchmarkSourceRowEligible,
  performanceBandForSeconds,
} from "./adaptEnrichedRow.js";

const DATASET_VERSION = "doubles_v2";
const DOUBLES_BENCHMARK_DIVISIONS = Object.freeze([
  "doubles_male",
  "doubles_female",
  "doubles_mixed",
  "pro_doubles_male",
  "pro_doubles_female",
]);
const DIVISIONS = HYROX_SCRAPER_DIVISIONS.filter((division) => DOUBLES_BENCHMARK_DIVISIONS.includes(division));
const MIN_GROUP_SAMPLE_SIZE = 100;
const MIN_AGE_SEGMENT_SAMPLE_SIZE = 50;
const MIN_REGIONAL_SAMPLE_SIZE = 200;
const REGIONS = Object.freeze(["europe", "oceania", "americas", "asia", "africa_me"]);

export { adaptEnrichedRow, isBenchmarkSourceRowEligible, performanceBandForSeconds };

function genderFromDivision(division) {
  if (division.endsWith("_male")) return "male";
  if (division.endsWith("_female")) return "female";
  return "mixed";
}

export function groupKey(division, performanceBand = null, gender = "all", ageGroup = "all", region = null) {
  if (performanceBand) {
    return `hyrox:${DATASET_VERSION}:band:${performanceBand}:${division}:${gender ?? "all"}`;
  }
  const base = `hyrox:${DATASET_VERSION}:${division}:${gender ?? "all"}:${ageGroup ?? "all"}`;
  return region ? `${base}:${region}` : base;
}

function groupRecords(adaptedRows, division, performanceBand = null) {
  return adaptedRows.filter((row) => row._division === division && (!performanceBand || row._performanceBand === performanceBand));
}

function makeGroup(division, records, performanceBand = null, gender = "all", ageGroup = "all", region = null) {
  return {
    groupKey: groupKey(division, performanceBand, gender, ageGroup, region),
    datasetVersion: DATASET_VERSION,
    division,
    gender,
    ageGroup,
    performanceBand,
    region,
    fallbackLevel: 0,
    sampleSize: records.length,
    records,
  };
}

export function buildGroups(adaptedRows) {
  const groups = [];

  for (const division of DIVISIONS) {
    const gender = genderFromDivision(division);
    const records = adaptedRows.filter((row) => row._division === division);
    groups.push(makeGroup(division, records, null, "all", "all"));

    for (const band of PERFORMANCE_BANDS) {
      groups.push(makeGroup(division, groupRecords(adaptedRows, division, band), band, "all", "all"));
    }

    for (const ageGroup of AGE_GROUP_WHITELIST) {
      const ageRows = records.filter((row) => row._ageGroup === ageGroup);
      if (ageRows.length >= MIN_AGE_SEGMENT_SAMPLE_SIZE) {
        groups.push(makeGroup(division, ageRows, null, gender, ageGroup));
      }
    }

    for (const region of REGIONS) {
      const regionRows = records.filter((row) => row._region === region);
      if (regionRows.length >= MIN_REGIONAL_SAMPLE_SIZE) {
        groups.push(makeGroup(division, regionRows, null, gender, "all", region));
      }
    }
  }

  return groups.filter((group) => {
    if (group.ageGroup !== "all" && group.performanceBand === null) {
      return group.sampleSize >= MIN_AGE_SEGMENT_SAMPLE_SIZE;
    }
    return group.sampleSize >= MIN_GROUP_SAMPLE_SIZE;
  });
}

async function upsertGroup(client, group) {
  await client.query(
    `INSERT INTO hyrox_benchmark_groups
      (group_key, dataset_version, division, gender, age_group, performance_band, fallback_level, sample_size, region)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (group_key) DO UPDATE SET
       dataset_version = EXCLUDED.dataset_version,
       division = EXCLUDED.division,
       gender = EXCLUDED.gender,
       age_group = EXCLUDED.age_group,
       performance_band = EXCLUDED.performance_band,
       fallback_level = EXCLUDED.fallback_level,
       sample_size = EXCLUDED.sample_size,
       region = EXCLUDED.region`,
    [
      group.groupKey,
      group.datasetVersion,
      group.division,
      group.gender,
      group.ageGroup,
      group.performanceBand,
      group.fallbackLevel,
      group.sampleSize,
      group.region ?? null,
    ],
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
       age_group,
       athlete_1_name,
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
       split_coverage_score,
	       data_quality_flags,
       event_country
     FROM hyrox_doubles_scraped_results
       WHERE division_category IN ('doubles_male','doubles_female','doubles_mixed','pro_doubles_male','pro_doubles_female')
       AND data_quality_status IN ('valid','partial')
       AND overall_time_seconds BETWEEN 2700 AND 28800
       AND athlete_1_name NOT ILIKE 'test%'
     ORDER BY division_category, overall_time_seconds`,
  );
  const adaptedRows = adaptEligibleEnrichedRows(rows);
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
