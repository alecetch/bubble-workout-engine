function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectOutliers(values, threshold = 3.5) {
  const clean = values.filter(Number.isFinite);
  const med = median(clean);
  if (med === null) return new Set();
  const deviations = clean.map((v) => Math.abs(v - med));
  const mad = median(deviations);
  if (!mad) return new Set();
  const outliers = new Set();
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const robustZ = (0.6745 * (value - med)) / mad;
    if (Math.abs(robustZ) > threshold) outliers.add(index);
  });
  return outliers;
}
