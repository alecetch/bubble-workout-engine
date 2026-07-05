#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../../db.js";
import { computeStatsForValues } from "../benchmarks/computeBenchmarkStats.js";

const DATASET_VERSION = "doubles_v1";
const DIVISIONS = ["doubles_male", "doubles_female", "doubles_mixed"];

function groupKey(division) {
  return `hyrox:${DATASET_VERSION}:${division}:all:all`;
}

async function upsertGroupAndMetric(client, division, values) {
  const stats = computeStatsForValues(values, values.length);
  const key = groupKey(division);
  await client.query(
    `INSERT INTO hyrox_benchmark_groups
      (group_key, dataset_version, division, gender, age_group, performance_band, fallback_level, sample_size)
     VALUES ($1, $2, $3, 'all', 'all', NULL, 0, $4)
     ON CONFLICT (group_key) DO UPDATE SET
       sample_size = EXCLUDED.sample_size`,
    [key, DATASET_VERSION, division, stats.sampleSize],
  );
  await client.query(
    `INSERT INTO hyrox_benchmark_metrics
      (group_key, metric_key, sample_size, mean_seconds, median_seconds, stddev_seconds,
       p10_seconds, p25_seconds, p50_seconds, p75_seconds, p90_seconds, p95_seconds, p99_seconds,
       cv, iqr_seconds, missingness_rate, outlier_rate)
     VALUES ($1, 'total_time', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
      key,
      stats.sampleSize,
      stats.meanSeconds,
      stats.medianSeconds,
      stats.stddevSeconds,
      stats.p10Seconds,
      stats.p25Seconds,
      stats.p50Seconds,
      stats.p75Seconds,
      stats.p90Seconds,
      stats.p95Seconds,
      stats.p99Seconds,
      stats.cv,
      stats.iqrSeconds,
      stats.missingnessRate,
      stats.outlierRate,
    ],
  );
  return { groupKey: key, sampleSize: stats.sampleSize };
}

export async function buildDoublesBenchmarks() {
  const { rows } = await pool.query(
    `SELECT division_category, overall_time_seconds
     FROM hyrox_doubles_scraped_results
     WHERE data_quality_status IN ('valid','partial')
       AND overall_time_seconds IS NOT NULL
     ORDER BY division_category, overall_time_seconds`,
  );
  const grouped = new Map(DIVISIONS.map((division) => [division, []]));
  for (const row of rows) {
    if (grouped.has(row.division_category)) grouped.get(row.division_category).push(Number(row.overall_time_seconds));
  }

  const written = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [division, values] of grouped.entries()) {
      if (!values.length) continue;
      written.push(await upsertGroupAndMetric(client, division, values));
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { rowsProcessed: rows.length, written };
}

function printSummary(summary) {
  console.log("HYROX doubles benchmark build complete");
  console.log(`rows_processed: ${summary.rowsProcessed}`);
  for (const group of summary.written) {
    console.log(`${group.groupKey}: ${group.sampleSize}`);
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
