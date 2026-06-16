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
  "0_10_km": 5,
  "11_20_km": 15,
  "21_40_km": 30,
  "41_60_km": 50,
  "60_plus_km": 70,
});

const STRENGTH_VERDICTS = Object.freeze({
  "0_1": "below_minimum",
  "2_3": "optimal",
  "4_5": "upper_range",
  "6_plus": "excessive",
});

const TIER_LABELS = Object.freeze({
  T1: "sub-60 minute",
  T2: "60-75 minute",
  T3: "75-90 minute",
  T4: "90-120 minute",
  T5: "120+ minute",
});

const RUNNING_BACKGROUND_COPY = Object.freeze({
  strength_sports: "As an athlete from a strength background, the aerobic ceiling is often the limiter that unlocks the next tier - running volume has an outsized return here.",
  team_sports: "Team sports typically develop short-burst conditioning rather than aerobic durability - longer aerobic work at easy to moderate intensity fills this gap.",
});

const STRENGTH_BACKGROUND_COPY = Object.freeze({
  running: "As a runner, building station-specific strength is often the highest-leverage change - prioritise functional loading over additional aerobic work.",
  crossfit: "CrossFit movement patterns transfer well to HYROX stations, but sessions that focus on HYROX-specific pacing and loading rather than generic WODs will sharpen station performance more efficiently.",
  strength_sports: "As an athlete from a strength sports background, it is common to default to more lifting than a hybrid event requires. The key question is whether your additional sessions are improving HYROX-specific output or adding fatigue that limits your running.",
});

function finishTimeTier(seconds) {
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 3600) return "T1";
  if (seconds < 4500) return "T2";
  if (seconds < 5400) return "T3";
  if (seconds < 7200) return "T4";
  return "T5";
}

function ageModifier(ageGroup) {
  if (!ageGroup) return AGE_RUNNING_MODIFIER.under_35;
  const n = parseInt(String(ageGroup).split(/[-–]/)[0], 10);
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

function scoreModulation(verdict, score, highThreshold, lowThreshold) {
  if (!Number.isFinite(score)) return "neutral";
  const isLow = verdict === "critically_low" || verdict === "below_minimum" || verdict === "below_optimal";
  const isHigh = verdict === "excessive" || verdict === "upper_range";
  if (isLow && score < lowThreshold) return "amplified";
  if (isLow && score >= highThreshold) return "toned_down";
  if (!isLow && !isHigh && score >= highThreshold) return "affirmed";
  return "neutral";
}

function isAge50Plus(ageGroup) {
  const n = parseInt(String(ageGroup ?? "").split(/[-–]/)[0], 10);
  return Number.isFinite(n) && n >= 50;
}

function runningBucketLabel(midpoint) {
  if (midpoint === 5) return "< 10 km/week";
  return `approximately ${midpoint} km/week`;
}

function appendAddendum(parts, text) {
  if (text) parts.push(text);
}

function buildRunningCopy(verdict, adjLow, adjHigh, midpoint, tierLabel, engineScore, modulation, ageGroup, primaryBackground, benchmarks) {
  const ageCaveat = ageGroup ? " after age adjustment" : "";
  const parts = [];

  if (verdict === "critically_low") {
    parts.push(`Your reported running volume (${runningBucketLabel(midpoint)}) is significantly below the recommended floor of ${benchmarks.minViable} km/week for a ${tierLabel} HYROX athlete.`);
    if (modulation === "toned_down") {
      parts.push(`Your race data suggests aerobic capacity isn't the primary limiter right now, but maintaining at least ${benchmarks.minViable} km/week will protect your base.`);
    } else {
      parts.push("A low aerobic base is likely to limit your run splits and your recovery between stations. Increasing gradually, targeting no more than 10% additional volume per week, is the most impactful training change you could make.");
      if (modulation === "amplified") parts.push("Your engine score from this race confirms the aerobic system is a current rate-limiter.");
    }
  } else if (verdict === "below_optimal") {
    parts.push(`Your reported volume of approximately ${midpoint} km/week is at the lower end for your performance level.`);
    parts.push(`The recommended range for a ${tierLabel} HYROX athlete${ageCaveat} is ${adjLow}-${adjHigh} km/week.`);
    if (modulation === "toned_down") {
      parts.push(`Your race data suggests aerobic capacity isn't the primary limiter right now, but maintaining at least ${benchmarks.minViable} km/week will protect your base.`);
    } else {
      parts.push(`Building gradually toward ${adjLow} km/week would strengthen your aerobic base without over-stressing recovery.`);
      if (modulation === "amplified") parts.push("Your run splits from this race suggest the aerobic system has room to grow - additional volume would compound over time.");
    }
  } else if (verdict === "on_track") {
    parts.push(`Your reported running volume of approximately ${midpoint} km/week is well-matched for a ${tierLabel} HYROX athlete.`);
    parts.push("Consistency at this volume, with a mix of easy and threshold work, is more valuable than adding quantity.");
    if (modulation === "affirmed") parts.push("Your engine score supports this - aerobic capacity is a relative strength in your profile.");
  } else if (verdict === "upper_range") {
    parts.push(`Your volume of approximately ${midpoint} km/week is at the upper end for a ${tierLabel} HYROX athlete.`);
    parts.push("This is manageable if your station training is still progressing, but watch for signs that run fatigue is crowding out quality strength work or slowing station recovery.");
  } else if (verdict === "excessive") {
    parts.push(`At approximately ${midpoint} km/week, your running load is higher than the typical optimum for a ${tierLabel} HYROX athlete.`);
    parts.push("This level of volume can be sustained by experienced aerobic athletes, but if your station performance is lagging, it is worth checking whether run fatigue is the cause.");
  }

  appendAddendum(parts, RUNNING_BACKGROUND_COPY[primaryBackground]);
  if ((verdict === "on_track" || verdict === "upper_range") && isAge50Plus(ageGroup)) {
    parts.push("At this training age, prioritising running frequency (4-5 short runs per week) over single-session volume helps maintain adaptation while managing recovery.");
  }
  return parts.join(" ");
}

function buildStrengthCopy(verdict, strengthScore, modulation, primaryBackground, limiterLabel) {
  const parts = [];

  if (verdict === "below_minimum") {
    if (modulation === "toned_down") {
      parts.push("Interestingly, your station scores suggest your current approach is sustaining reasonable functional capacity. Whatever functional training you're doing appears to carry over - but formal loading sessions would give you more headroom under race fatigue.");
    } else {
      parts.push("One or fewer strength sessions per week is below the minimum most HYROX athletes need to maintain the functional capacity required across 8 stations.");
      parts.push("Aim for at least 2 sessions per week with compound lower-body movements (squats, lunges, Romanian deadlifts) and pulling patterns (rows, pull-downs) that transfer directly to HYROX stations.");
    }
    if (modulation === "amplified") parts.push("Your station performance from this race supports this - the data points to station capacity as a current limiter.");
  } else if (verdict === "optimal") {
    parts.push("Two to three strength sessions per week is the optimal range for most HYROX athletes - enough volume to maintain and develop station capacity without compromising running recovery.");
    parts.push("The priority at this frequency is specificity: compound lower-body loading, unilateral movements, and pulling patterns that map to the HYROX stations.");
    if (limiterLabel) parts.push(`Given that ${limiterLabel} is your current biggest limiter, ensure at least one session per week directly targets that movement pattern.`);
    if (modulation === "amplified") parts.push("Your station performance from this race supports this - the data points to station capacity as a current limiter.");
  } else if (verdict === "upper_range") {
    parts.push("Four to five strength sessions per week is workable with careful programming, but it carries a risk of compromising run quality through accumulated fatigue.");
    parts.push("Ensure these sessions are HYROX-specific (sled work, row ergometry, sandbag and farmer carry patterns) rather than traditional training splits that add load without station specificity.");
  } else if (verdict === "excessive") {
    parts.push("Six or more strength sessions per week is a high training load for a hybrid athlete.");
    parts.push("Unless these are short, HYROX-targeted, and well-separated from running sessions, this volume is likely limiting your aerobic adaptation. Most HYROX coaches would recommend redistributing 2-3 of these sessions toward running or recovery work.");
  }

  appendAddendum(parts, STRENGTH_BACKGROUND_COPY[primaryBackground]);
  return parts.join(" ");
}

export function buildTrainingVolumeAdvice(analysisJson = {}, athleteContext = {}) {
  const hasRunning = Boolean(athleteContext.weeklyRunningVolume);
  const hasStrength = Boolean(athleteContext.weeklyStrengthSessions);
  if (!hasRunning && !hasStrength) return null;

  const finishSeconds = analysisJson.race?.finishTimeSeconds
    ?? athleteContext.targetFinishTimeSeconds
    ?? null;
  const tierId = finishTimeTier(finishSeconds);
  const engineScore = analysisJson.scores?.engineScore ?? null;
  const strengthScore = analysisJson.scores?.strengthScore ?? null;
  const ageGroup = analysisJson.athlete?.ageGroup ?? athleteContext.ageGroup ?? null;
  const background = athleteContext.primaryBackground ?? null;
  const limiterLabel = analysisJson.headline?.biggestLimiter?.label ?? null;

  let runningAdvice = null;
  if (hasRunning && tierId) {
    const benchmarks = RUNNING_BENCHMARKS[tierId];
    const mod = ageModifier(ageGroup);
    const midpoint = BUCKET_MIDPOINTS[athleteContext.weeklyRunningVolume] ?? null;
    if (Number.isFinite(midpoint)) {
      const { verdict, adjLow, adjHigh } = runningVerdict(midpoint, benchmarks, mod);
      const modulation = scoreModulation(verdict, engineScore, 70, 50);
      runningAdvice = {
        verdict,
        athleteKmMidpoint: midpoint,
        optimalRange: { low: adjLow, high: adjHigh },
        tierId,
        tierLabel: TIER_LABELS[tierId],
        ageGroupModifierApplied: mod.upperMod !== 1.0,
        scoreModulation: modulation,
        copy: buildRunningCopy(verdict, adjLow, adjHigh, midpoint, TIER_LABELS[tierId], engineScore, modulation, ageGroup, background, benchmarks),
      };
    }
  }

  let strengthAdvice = null;
  if (hasStrength) {
    const verdict = STRENGTH_VERDICTS[athleteContext.weeklyStrengthSessions] ?? null;
    if (verdict) {
      let modulation = scoreModulation(verdict, strengthScore, 70, 45);
      if (Number.isFinite(strengthScore) && strengthScore < 45) modulation = "amplified";
      if (verdict === "below_minimum" && Number.isFinite(strengthScore) && strengthScore >= 70) modulation = "toned_down";
      strengthAdvice = {
        verdict,
        bucket: athleteContext.weeklyStrengthSessions,
        scoreModulation: modulation,
        copy: buildStrengthCopy(verdict, strengthScore, modulation, background, limiterLabel),
      };
    }
  }

  if (!runningAdvice && !strengthAdvice) return null;
  return { runningAdvice, strengthAdvice };
}
