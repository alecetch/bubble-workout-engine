export function formatSeconds(s) {
  if (s == null || !Number.isFinite(s)) return "-";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function stationLabel(key) {
  const labels = {
    skierg: "SkiErg",
    sled_push: "Sled Push",
    sled_pull: "Sled Pull",
    burpee_bj: "Burpee Broad Jump",
    row: "Row",
    farmers_carry: "Farmer's Carry",
    sandbag_lunge: "Sandbag Lunge",
    wall_balls: "Wall Balls",
    run_total: "Running",
    station_total: "Station work",
    combined_sled: "Combined Sled",
  };
  return labels[key] || key.replace(/_/g, " ");
}

export function interpolatePercentile(value, benchmarks) {
  if (!benchmarks || value == null) return null;
  const pts = [
    { pct: 10, val: benchmarks.p10_seconds },
    { pct: 25, val: benchmarks.p25_seconds },
    { pct: 50, val: benchmarks.p50_seconds },
    { pct: 75, val: benchmarks.p75_seconds },
    { pct: 90, val: benchmarks.p90_seconds },
  ].filter((p) => p.val != null).sort((a, b) => a.val - b.val);
  if (pts.length < 2) return null;
  if (value <= pts[0].val) return pts[0].pct;
  if (value >= pts[pts.length - 1].val) return pts[pts.length - 1].pct;
  for (let i = 0; i < pts.length - 1; i += 1) {
    if (value >= pts[i].val && value <= pts[i + 1].val) {
      const frac = (value - pts[i].val) / (pts[i + 1].val - pts[i].val);
      return Math.round(pts[i].pct + frac * (pts[i + 1].pct - pts[i].pct));
    }
  }
  return null;
}
