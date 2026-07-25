// HYROX training volume benchmarks - initial heuristic values (June 2026).
// Replace with data-derived values once aggregate training submissions reach
// ~500 per tier. See docs/specs/feature-100-hyrox-training-volume-advisor-spec.md.
const RUNNING_BENCHMARKS = Object.freeze({
  T1: { minViable: 55, optimalLow: 65, optimalHigh: 85, aboveOptimal: 90 },
  T2: { minViable: 40, optimalLow: 50, optimalHigh: 65, aboveOptimal: 75 },
  T3: { minViable: 30, optimalLow: 38, optimalHigh: 52, aboveOptimal: 65 },
  T4: { minViable: 20, optimalLow: 28, optimalHigh: 42, aboveOptimal: 55 },
  T5: { minViable: 15, optimalLow: 20, optimalHigh: 32, aboveOptimal: 45 },
});

const AGE_RUNNING_MODIFIER = Object.freeze({
  under_35: { lowerMod: 1.00, upperMod: 1.00 },
  "35_49": { lowerMod: 1.00, upperMod: 0.90 },
  "50_54": { lowerMod: 0.95, upperMod: 0.85 },
  "55_plus": { lowerMod: 0.90, upperMod: 0.80 },
});

const BUCKET_MIDPOINTS = Object.freeze({
  // Current frontend keys
  "under_15_km": 10,
  "15_30_km": 22,
  "30_45_km": 37,
  "45_plus_km": 55,
  // Legacy keys (kept for backward compat with stored athlete_context_json)
  "0_10_km": 5,
  "11_20_km": 15,
  "21_40_km": 30,
  "41_60_km": 50,
  "60_plus_km": 70,
});

const STRENGTH_VERDICTS = Object.freeze({
  // Current frontend keys
  "2_3_days_week": "optimal",
  "4_5_days_week": "upper_range",
  "6_plus_days_week": "excessive",
  // Legacy keys
  "0_1": "below_minimum",
  "2_3": "optimal",
  "4_5": "upper_range",
  "6_plus": "excessive",
});

export const TIER_LABELS = Object.freeze({
  T1: "sub-60 minute",
  T2: "60-75 minute",
  T3: "75-90 minute",
  T4: "90-120 minute",
  T5: "120+ minute",
});

export function finishTimeTier(seconds) {
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 3600) return "T1";
  if (seconds < 4500) return "T2";
  if (seconds < 5400) return "T3";
  if (seconds < 7200) return "T4";
  return "T5";
}

function ageModifier(ageGroup) {
  if (!ageGroup) return AGE_RUNNING_MODIFIER.under_35;
  const n = parseInt(String(ageGroup).split(/-/)[0], 10);
  if (!Number.isFinite(n)) return AGE_RUNNING_MODIFIER.under_35;
  if (n >= 55) return AGE_RUNNING_MODIFIER["55_plus"];
  if (n >= 50) return AGE_RUNNING_MODIFIER["50_54"];
  if (n >= 35) return AGE_RUNNING_MODIFIER["35_49"];
  return AGE_RUNNING_MODIFIER.under_35;
}

function runningVerdict(midpoint, benchmarks, mod) {
  const adjLow = Math.round(benchmarks.optimalLow * mod.lowerMod);
  const adjHigh = Math.round(benchmarks.optimalHigh * mod.upperMod);
  if (midpoint < benchmarks.minViable) return { verdict: "critically_low", adjLow, adjHigh };
  if (midpoint < adjLow) return { verdict: "below_optimal", adjLow, adjHigh };
  if (midpoint <= adjHigh) return { verdict: "on_track", adjLow, adjHigh };
  if (midpoint >= 70 && benchmarks.aboveOptimal === 75) return { verdict: "excessive", adjLow, adjHigh };
  if (midpoint <= benchmarks.aboveOptimal) return { verdict: "upper_range", adjLow, adjHigh };
  return { verdict: "excessive", adjLow, adjHigh };
}

function runningBucketLabel(midpoint) {
  if (midpoint === 5) return "< 10 km/week";
  return `approximately ${midpoint} km/week`;
}

function runningPosition(verdict) {
  if (verdict === "critically_low" || verdict === "below_optimal") return "below that range";
  if (verdict === "on_track") return "within that range";
  if (verdict === "upper_range") return "above the typical range but below the high-volume threshold";
  if (verdict === "excessive") return "above the typical range";
  return "relative to that range";
}

function buildRunningCopy(verdict, adjLow, adjHigh, midpoint, tierLabel, ageGroup, benchmarks) {
  const ageCaveat = ageGroup ? " after age adjustment" : "";
  const floorText = midpoint < benchmarks.minViable
    ? ` The minimum benchmark floor for this tier is ${benchmarks.minViable} km/week.`
    : "";
  return `Your reported running volume is ${runningBucketLabel(midpoint)}. For a ${tierLabel} HYROX athlete${ageCaveat}, the typical range is ${adjLow}-${adjHigh} km/week.${floorText} Your reported volume is ${runningPosition(verdict)}.`;
}

function strengthBucketLabel(bucket) {
  if (bucket === "0_1") return "one or fewer strength sessions per week";
  if (bucket === "2_3" || bucket === "2_3_days_week") return "2-3 strength sessions per week";
  if (bucket === "4_5" || bucket === "4_5_days_week") return "4-5 strength sessions per week";
  if (bucket === "6_plus" || bucket === "6_plus_days_week") return "6 or more strength sessions per week";
  return "the reported strength-session range";
}

function strengthPosition(verdict) {
  if (verdict === "below_minimum") return "below that range";
  if (verdict === "optimal") return "within that range";
  if (verdict === "upper_range") return "above that range";
  if (verdict === "excessive") return "well above that range";
  return "relative to that range";
}

function buildStrengthCopy(verdict, bucket) {
  return `Your reported strength volume is ${strengthBucketLabel(bucket)}. For most HYROX athletes, the typical strength-session range is 2-3 sessions per week. Your reported strength volume is ${strengthPosition(verdict)}.`;
}

export function buildTrainingVolumeAdvice(analysisJson = {}, athleteContext = {}) {
  const hasRunning = Boolean(athleteContext.weeklyRunningVolume);
  const hasStrength = Boolean(athleteContext.weeklyStrengthSessions);
  if (!hasRunning && !hasStrength) return null;

  const finishSeconds = analysisJson.race?.finishTimeSeconds
    ?? athleteContext.targetFinishTimeSeconds
    ?? null;
  const tierId = finishTimeTier(finishSeconds);
  const ageGroup = analysisJson.athlete?.ageGroup ?? athleteContext.ageGroup ?? null;

  let runningAdvice = null;
  if (hasRunning && tierId) {
    const benchmarks = RUNNING_BENCHMARKS[tierId];
    const mod = ageModifier(ageGroup);
    const midpoint = BUCKET_MIDPOINTS[athleteContext.weeklyRunningVolume] ?? null;
    if (Number.isFinite(midpoint)) {
      const { verdict, adjLow, adjHigh } = runningVerdict(midpoint, benchmarks, mod);
      runningAdvice = {
        verdict,
        athleteKmMidpoint: midpoint,
        optimalRange: { low: adjLow, high: adjHigh },
        tierId,
        tierLabel: TIER_LABELS[tierId],
        ageGroupModifierApplied: mod.upperMod !== 1.0,
        copy: buildRunningCopy(verdict, adjLow, adjHigh, midpoint, TIER_LABELS[tierId], ageGroup, benchmarks),
      };
    }
  }

  let strengthAdvice = null;
  if (hasStrength) {
    const verdict = STRENGTH_VERDICTS[athleteContext.weeklyStrengthSessions] ?? null;
    if (verdict) {
      strengthAdvice = {
        verdict,
        bucket: athleteContext.weeklyStrengthSessions,
        typicalRange: { low: 2, high: 3 },
        copy: buildStrengthCopy(verdict, athleteContext.weeklyStrengthSessions),
      };
    }
  }

  if (!runningAdvice && !strengthAdvice) return null;
  return { runningAdvice, strengthAdvice };
}
