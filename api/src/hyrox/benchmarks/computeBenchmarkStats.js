import { ROXZONE_KEYS, RUN_KEYS, STATION_KEYS } from "../config/segmentMap.js";
import { detectOutliers } from "../validation/outlierDetection.js";

export const BENCHMARK_METRIC_KEYS = Object.freeze([
  "total_time",
  "run_time",
  "work_time",
  "roxzone_time",
  "avg_run_split",
  ...STATION_KEYS,
  ...RUN_KEYS,
  ...ROXZONE_KEYS,
]);

function metricValue(record, metricKey) {
  if (metricKey === "total_time") return record.total_time_seconds;
  if (metricKey === "run_time") return record.run_time_seconds;
  if (metricKey === "work_time") return record.work_time_seconds;
  if (metricKey === "roxzone_time") return record.roxzone_time_seconds;
  if (metricKey === "avg_run_split") {
    const values = RUN_KEYS.map((key) => record.segments?.[key]?.seconds).filter(Number.isFinite);
    return values.length === RUN_KEYS.length ? values.reduce((sum, v) => sum + v, 0) / RUN_KEYS.length : null;
  }
  return record.segments?.[metricKey]?.seconds ?? null;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((p / 100) * (sortedValues.length - 1))));
  return sortedValues[index];
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values, avg) {
  if (values.length < 2 || avg === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function trimForMean(sortedValues) {
  if (sortedValues.length < 200) return sortedValues;
  const trimCount = Math.floor(sortedValues.length * 0.005);
  return sortedValues.slice(trimCount, sortedValues.length - trimCount);
}

export function computeMetricPercentile(value, sortedValues) {
  if (!Number.isFinite(value) || sortedValues.length === 0) return null;
  const slowerOrEqual = sortedValues.filter((candidate) => candidate >= value).length;
  return (slowerOrEqual / sortedValues.length) * 100;
}

export function computeStatsForValues(values, totalCount = values.length) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) {
    return {
      sampleSize: 0,
      meanSeconds: null,
      medianSeconds: null,
      stddevSeconds: null,
      p10Seconds: null,
      p25Seconds: null,
      p50Seconds: null,
      p75Seconds: null,
      p90Seconds: null,
      p95Seconds: null,
      p99Seconds: null,
      cv: null,
      iqrSeconds: null,
      missingnessRate: totalCount > 0 ? 1 : 0,
      outlierRate: 0,
    };
  }

  const trimmedMean = mean(trimForMean(clean));
  const stdev = stddev(clean, mean(clean));
  const p25 = percentile(clean, 25);
  const p75 = percentile(clean, 75);
  const outliers = detectOutliers(values);

  return {
    sampleSize: clean.length,
    meanSeconds: trimmedMean,
    medianSeconds: percentile(clean, 50),
    stddevSeconds: stdev,
    p10Seconds: percentile(clean, 10),
    p25Seconds: p25,
    p50Seconds: percentile(clean, 50),
    p75Seconds: p75,
    p90Seconds: percentile(clean, 90),
    p95Seconds: percentile(clean, 95),
    p99Seconds: percentile(clean, 99),
    fastestSeconds: clean[0],
    slowestSeconds: clean[clean.length - 1],
    cv: stdev && trimmedMean ? stdev / trimmedMean : null,
    iqrSeconds: p75 !== null && p25 !== null ? p75 - p25 : null,
    missingnessRate: totalCount > 0 ? (totalCount - clean.length) / totalCount : 0,
    outlierRate: totalCount > 0 ? outliers.size / totalCount : 0,
  };
}

export function computeBenchmarkStats(groups, metricKeys = BENCHMARK_METRIC_KEYS) {
  const metrics = [];
  for (const group of groups) {
    for (const metricKey of metricKeys) {
      const values = group.records.map((record) => metricValue(record, metricKey));
      const stats = computeStatsForValues(values, group.records.length);
      if (stats.sampleSize === 0) continue;
      metrics.push({
        groupKey: group.groupKey,
        metricKey,
        ...stats,
      });
    }
  }
  return metrics;
}
