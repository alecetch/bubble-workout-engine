// HYROX squat/deadlift-vs-bodyweight benchmarks - initial heuristic values (2026-07).
// Not yet calibrated against real result data - see
// docs/specs/feature-150-hyrox-muscle-signal-strength-commentary-spec.md.
import { estimateOneRepMax } from "../hyroxPredictorEngine.js";
import { finishTimeTier, TIER_LABELS } from "./trainingVolumeAdvisor.js";

const STRENGTH_BENCHMARKS_PCT_BW = Object.freeze({
  T1: { backSquat: { low: 130, high: 175 }, deadlift: { low: 170, high: 220 } },
  T2: { backSquat: { low: 115, high: 150 }, deadlift: { low: 150, high: 190 } },
  T3: { backSquat: { low: 100, high: 130 }, deadlift: { low: 130, high: 165 } },
  T4: { backSquat: { low: 85, high: 115 }, deadlift: { low: 110, high: 145 } },
  T5: { backSquat: { low: 75, high: 105 }, deadlift: { low: 100, high: 135 } },
});

const FEMALE_SCALE = 0.75;
const KG_TO_LB = 2.20462;

function scaledRange(range, sex) {
  const scale = sex === "female" ? FEMALE_SCALE : 1;
  return { low: range.low * scale, high: range.high * scale };
}

function position(pct, low, high) {
  if (pct < low) return "below that range";
  if (pct <= high) return "within that range";
  return "above that range";
}

function displayWeight(kg, unit) {
  if (unit === "lb") return `~${Math.round(kg * KG_TO_LB)} lb`;
  return `~${Math.round(kg)} kg`;
}

function liftSentence(liftLabel, weightKg, reps, bodyweightKg, range, tierLabel, unit) {
  const oneRepMax = estimateOneRepMax(weightKg, reps);
  const pct = Math.round((oneRepMax / bodyweightKg) * 100);
  return `Your estimated ${liftLabel} 1RM is ${displayWeight(oneRepMax, unit)} (${pct}% of bodyweight). For a ${tierLabel} HYROX target, the typical range is ${Math.round(range.low)}-${Math.round(range.high)}% of bodyweight - yours is ${position(pct, range.low, range.high)}.`;
}

export function buildStrengthSignalCopy(analysisJson = {}, athleteContext = {}, calculatorMode = "target") {
  if (calculatorMode !== "target") return null;

  const targetSeconds = athleteContext.targetFinishTimeSeconds
    ?? analysisJson.benchmarkContext?.goalBenchmarkGroup?.targetFinishSeconds
    ?? null;
  const tierId = finishTimeTier(targetSeconds);
  if (!tierId) return null;

  const bodyweightKg = Number(athleteContext.bodyweightKg);
  if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return null;

  const sex = analysisJson.athlete?.sex ?? athleteContext.sex ?? "male";
  const unit = athleteContext.weightUnit === "lb" ? "lb" : "kg";
  const tierLabel = TIER_LABELS[tierId];
  const benchmarks = STRENGTH_BENCHMARKS_PCT_BW[tierId];

  const squatKg = Number(athleteContext.backSquatKg ?? athleteContext.squatKg);
  const deadliftKg = Number(athleteContext.deadliftKg);

  const sentences = [];
  if (Number.isFinite(squatKg) && squatKg > 0) {
    sentences.push(liftSentence(
      "back squat",
      squatKg,
      athleteContext.backSquatReps,
      bodyweightKg,
      scaledRange(benchmarks.backSquat, sex),
      tierLabel,
      unit,
    ));
  }
  if (Number.isFinite(deadliftKg) && deadliftKg > 0) {
    sentences.push(liftSentence(
      "deadlift",
      deadliftKg,
      athleteContext.deadliftReps,
      bodyweightKg,
      scaledRange(benchmarks.deadlift, sex),
      tierLabel,
      unit,
    ));
  }

  if (sentences.length === 0) return null;
  return sentences.join(" ");
}
