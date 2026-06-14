#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../../db.js";
import { parseCsvFile } from "../ingestion/parseCsvResults.js";
import { markDuplicateRecords } from "../validation/duplicateDetection.js";
import { buildBenchmarkDatasets } from "../benchmarks/buildBenchmarkDatasets.js";
import { buildBenchmarkGroups } from "../benchmarks/buildBenchmarkGroups.js";
import { computeBenchmarkStats } from "../benchmarks/computeBenchmarkStats.js";
import { rebuildHyroxBenchmarkTables, rebuildHyroxRawAndCleanResults } from "../benchmarks/saveBenchmarks.js";

export const HYROX_DATASET_VERSION = "historical_hyrox_2026_06_v1";

function defaultDatasetPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../docs/planning/hyrox_calculator/extracted/archive/hyrox_results.csv");
}

function countStatuses(records) {
  return records.reduce(
    (counts, record) => {
      const status = record.validation?.status ?? "fail";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    },
    { pass: 0, warning: 0, partial: 0, fail: 0, quarantine: 0 },
  );
}

export async function buildHyroxBenchmarks(options = {}) {
  const datasetPath = options.datasetPath ?? process.env.HYROX_DATASET_PATH ?? defaultDatasetPath();
  const sourceFile = path.basename(datasetPath);
  const parsed = await parseCsvFile(datasetPath, { sourceFile });
  const records = markDuplicateRecords(parsed);
  const datasets = buildBenchmarkDatasets(records);
  const groups = buildBenchmarkGroups(datasets.overall_benchmark, { datasetVersion: HYROX_DATASET_VERSION });
  const metrics = computeBenchmarkStats(groups);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultCounts = await rebuildHyroxRawAndCleanResults(client, records, {
      datasetVersion: HYROX_DATASET_VERSION,
      sourceFile,
    });
    const benchmarkCounts = await rebuildHyroxBenchmarkTables(client, groups, metrics);
    await client.query("COMMIT");

    return {
      datasetPath,
      rowsProcessed: records.length,
      statuses: countStatuses(records),
      datasets: Object.fromEntries(Object.entries(datasets).map(([key, value]) => [key, value.length])),
      ...resultCounts,
      ...benchmarkCounts,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function printSummary(summary) {
  console.log("HYROX benchmark build complete");
  console.log(`dataset: ${summary.datasetPath}`);
  console.log(`rows_processed: ${summary.rowsProcessed}`);
  console.log(`status_pass: ${summary.statuses.pass}`);
  console.log(`status_warning: ${summary.statuses.warning}`);
  console.log(`status_partial: ${summary.statuses.partial}`);
  console.log(`status_fail: ${summary.statuses.fail}`);
  console.log(`status_quarantine: ${summary.statuses.quarantine}`);
  console.log(`raw_results: ${summary.rawCount}`);
  console.log(`clean_results: ${summary.cleanCount}`);
  console.log(`benchmark_groups: ${summary.groupCount}`);
  console.log(`benchmark_metrics: ${summary.metricCount}`);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  buildHyroxBenchmarks()
    .then(printSummary)
    .catch((err) => {
      console.error(err?.stack || err?.message || err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
