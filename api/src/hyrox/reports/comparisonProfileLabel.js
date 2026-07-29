import { PERFORMANCE_BAND_THRESHOLDS_MINUTES } from "../config/benchmarkThresholds.js";
import { comparisonLabel } from "./comparisonBasis.js";

export function performanceBandLabel(band) {
  const raw = String(band ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "over_120" || raw === "over-120") return "120+";
  const match = raw.match(/^sub[_-](\d+)$/);
  if (!match) return null;
  const upper = Number(match[1]);
  if (!Number.isFinite(upper)) return null;
  const index = PERFORMANCE_BAND_THRESHOLDS_MINUTES.indexOf(upper);
  const lower = index > 0 ? PERFORMANCE_BAND_THRESHOLDS_MINUTES[index - 1] : null;
  return lower ? `SUB ${lower}-${upper}` : `SUB ${upper}`;
}

function bandFromGroup(group) {
  if (!group) return null;
  if (group.performanceBand) return group.performanceBand;
  const keyMatch = String(group.key ?? "").match(/(?:^|:)band:([^:]+)/);
  return keyMatch?.[1] ?? null;
}

export function comparisonProfileLabel(analysisJson = {}) {
  const basis = comparisonLabel(analysisJson);
  if (basis !== "MEDIAN") return basis;

  const benchmarkContext = analysisJson.benchmarkContext ?? {};
  const band = benchmarkContext.analysisFrame?.comparisonBand
    ?? bandFromGroup(benchmarkContext.escalationBasisBandGroup)
    ?? bandFromGroup(benchmarkContext.primaryBenchmarkGroup);
  const label = performanceBandLabel(band);
  return label ? `${label} MEDIAN` : "MEDIAN";
}
