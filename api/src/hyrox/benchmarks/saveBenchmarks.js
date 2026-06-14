import { buildValidationAudit } from "../audit/validationAudit.js";

const BATCH_SIZE = 500;

function json(value) {
  return JSON.stringify(value ?? null);
}

function rowValues(record, datasetVersion, sourceFile) {
  return [
    sourceFile,
    datasetVersion,
    record.rowNumber,
    json(record.raw),
  ];
}

async function insertRows(client, sqlPrefix, rows, rowWidth, returning = false) {
  const results = [];
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const placeholders = [];
    const values = [];
    let param = 1;
    for (const row of batch) {
      placeholders.push(`(${Array.from({ length: rowWidth }, () => `$${param++}`).join(", ")})`);
      values.push(...row);
    }
    const res = await client.query(`${sqlPrefix} ${placeholders.join(", ")}${returning ? " RETURNING id" : ""}`, values);
    if (returning) results.push(...res.rows);
  }
  return results;
}

export async function rebuildHyroxRawAndCleanResults(client, records, options = {}) {
  const datasetVersion = options.datasetVersion ?? "historical_hyrox_2026_06_v1";
  const sourceFile = options.sourceFile ?? "hyrox_results.csv";

  await client.query("TRUNCATE hyrox_validation_audits, hyrox_clean_results, hyrox_raw_results RESTART IDENTITY CASCADE");

  const rawRows = records.map((record) => rowValues(record, datasetVersion, sourceFile));
  const rawIds = await insertRows(
    client,
    "INSERT INTO hyrox_raw_results (source_file, dataset_version, row_number, raw_json) VALUES",
    rawRows,
    4,
    true,
  );

  const cleanRows = [];
  const cleanSourceRecords = [];
  records.forEach((record, index) => {
    if (!Number.isFinite(record.total_time_seconds) || record.total_time_seconds <= 0) return;
    cleanSourceRecords.push(record);
    cleanRows.push([
      rawIds[index]?.id ?? null,
      datasetVersion,
      record.event_id,
      record.event_name,
      record.gender,
      record.nationality,
      record.age_group,
      record.division,
      record.total_time_seconds,
      record.run_time_seconds,
      record.work_time_seconds,
      record.roxzone_time_seconds,
      json(record.segments),
      record.validation.status,
      record.validation.qualityScore,
      json(record.validation.flags),
      json(record.validation.benchmarkEligibility),
    ]);
  });

  const cleanIds = await insertRows(
    client,
    `INSERT INTO hyrox_clean_results (
      raw_result_id, dataset_version, event_id, event_name, gender, nationality, age_group, division,
      total_time_seconds, run_time_seconds, work_time_seconds, roxzone_time_seconds, segments_json,
      validation_status, quality_score, flags, benchmark_eligibility
    ) VALUES`,
    cleanRows,
    17,
    true,
  );

  const auditRows = cleanSourceRecords.map((record, index) => {
    const audit = buildValidationAudit(record);
    return [
      cleanIds[index]?.id ?? null,
      audit.source,
      audit.validationStatus,
      audit.qualityScore,
      json(audit.flags),
      json(audit.parsedTimes),
      json(audit.consistency),
      json(audit.benchmarkEligibility),
    ];
  });

  await insertRows(
    client,
    `INSERT INTO hyrox_validation_audits (
      clean_result_id, source, validation_status, quality_score, flags, parsed_times, consistency, benchmark_eligibility
    ) VALUES`,
    auditRows,
    8,
    false,
  );

  return { rawCount: rawRows.length, cleanCount: cleanRows.length, auditCount: auditRows.length };
}

export async function rebuildHyroxBenchmarkTables(client, groups, metrics) {
  await client.query("TRUNCATE hyrox_benchmark_metrics, hyrox_benchmark_groups RESTART IDENTITY CASCADE");

  await insertRows(
    client,
    `INSERT INTO hyrox_benchmark_groups (
      group_key, dataset_version, division, gender, age_group, performance_band, fallback_level, sample_size
    ) VALUES`,
    groups.map((group) => [
      group.groupKey,
      group.datasetVersion,
      group.division,
      group.gender,
      group.ageGroup,
      group.performanceBand,
      group.fallbackLevel,
      group.sampleSize,
    ]),
    8,
    false,
  );

  await insertRows(
    client,
    `INSERT INTO hyrox_benchmark_metrics (
      group_key, metric_key, sample_size, mean_seconds, median_seconds, stddev_seconds,
      p10_seconds, p25_seconds, p50_seconds, p75_seconds, p90_seconds, p95_seconds, p99_seconds,
      cv, iqr_seconds, missingness_rate, outlier_rate
    ) VALUES`,
    metrics.map((metric) => [
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
    ]),
    17,
    false,
  );

  return { groupCount: groups.length, metricCount: metrics.length };
}
