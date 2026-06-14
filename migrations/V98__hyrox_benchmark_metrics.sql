CREATE TABLE IF NOT EXISTS hyrox_benchmark_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key TEXT NOT NULL REFERENCES hyrox_benchmark_groups(group_key) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  mean_seconds NUMERIC,
  median_seconds NUMERIC,
  stddev_seconds NUMERIC,
  p10_seconds NUMERIC,
  p25_seconds NUMERIC,
  p50_seconds NUMERIC,
  p75_seconds NUMERIC,
  p90_seconds NUMERIC,
  p95_seconds NUMERIC,
  p99_seconds NUMERIC,
  cv NUMERIC,
  iqr_seconds NUMERIC,
  missingness_rate NUMERIC,
  outlier_rate NUMERIC,
  UNIQUE(group_key, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_hyrox_benchmark_metrics_metric
  ON hyrox_benchmark_metrics (metric_key);
