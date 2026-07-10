const metricCache = new Map();
const groupCache = new Map();

function metricKey(groupKey, metricKeyValue) {
  return `${groupKey}::${metricKeyValue}`;
}

function toCamelMetric(row) {
  return {
    groupKey: row.group_key ?? row.groupKey,
    metricKey: row.metric_key ?? row.metricKey,
    sampleSize: Number(row.sample_size ?? row.sampleSize ?? 0),
    meanSeconds: numberOrNull(row.mean_seconds ?? row.meanSeconds),
    medianSeconds: numberOrNull(row.median_seconds ?? row.medianSeconds),
    stddevSeconds: numberOrNull(row.stddev_seconds ?? row.stddevSeconds),
    p10Seconds: numberOrNull(row.p10_seconds ?? row.p10Seconds),
    p25Seconds: numberOrNull(row.p25_seconds ?? row.p25Seconds),
    p50Seconds: numberOrNull(row.p50_seconds ?? row.p50Seconds),
    p75Seconds: numberOrNull(row.p75_seconds ?? row.p75Seconds),
    p90Seconds: numberOrNull(row.p90_seconds ?? row.p90Seconds),
    p95Seconds: numberOrNull(row.p95_seconds ?? row.p95Seconds),
    p99Seconds: numberOrNull(row.p99_seconds ?? row.p99Seconds),
    cv: numberOrNull(row.cv),
    iqrSeconds: numberOrNull(row.iqr_seconds ?? row.iqrSeconds),
    missingnessRate: numberOrNull(row.missingness_rate ?? row.missingnessRate),
    outlierRate: numberOrNull(row.outlier_rate ?? row.outlierRate),
    sortedValues: Array.isArray(row.sortedValues) ? row.sortedValues.filter(Number.isFinite).sort((a, b) => a - b) : null,
  };
}

function toCamelGroup(row) {
  return {
    groupKey: row.group_key ?? row.groupKey,
    datasetVersion: row.dataset_version ?? row.datasetVersion,
    division: row.division ?? null,
    gender: row.gender ?? null,
    ageGroup: row.age_group ?? row.ageGroup ?? null,
    performanceBand: row.performance_band ?? row.performanceBand ?? null,
    region: row.region ?? null,
    fallbackLevel: Number(row.fallback_level ?? row.fallbackLevel ?? 0),
    sampleSize: Number(row.sample_size ?? row.sampleSize ?? 0),
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadBenchmarkData(db) {
  const [groupsRes, metricsRes] = await Promise.all([
    db.query("SELECT * FROM hyrox_benchmark_groups"),
    db.query("SELECT * FROM hyrox_benchmark_metrics"),
  ]);

  setBenchmarkData({
    groups: groupsRes.rows ?? [],
    metrics: metricsRes.rows ?? [],
  });

  if (metricCache.size === 0) {
    console.warn("[hyrox] no benchmark metrics loaded; analysis engine will run in degraded mode");
  }

  return { groupCount: groupCache.size, metricCount: metricCache.size };
}

export function setBenchmarkData({ groups = [], metrics = [] } = {}) {
  groupCache.clear();
  metricCache.clear();

  for (const raw of groups) {
    const group = toCamelGroup(raw);
    if (group.groupKey) groupCache.set(group.groupKey, group);
  }

  for (const raw of metrics) {
    const metric = toCamelMetric(raw);
    if (metric.groupKey && metric.metricKey) {
      metricCache.set(metricKey(metric.groupKey, metric.metricKey), metric);
    }
  }
}

export function getBenchmarkStats(groupKeyValue, metricKeyValue) {
  if (!groupKeyValue || !metricKeyValue) return null;
  return metricCache.get(metricKey(groupKeyValue, metricKeyValue)) ?? null;
}

export function getBenchmarkGroup(groupKeyValue) {
  if (!groupKeyValue) return null;
  return groupCache.get(groupKeyValue) ?? null;
}

export function listBenchmarkGroups() {
  return [...groupCache.values()];
}

export function hasBenchmarkData() {
  return metricCache.size > 0 && groupCache.size > 0;
}
