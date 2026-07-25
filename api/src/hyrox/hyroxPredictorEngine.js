const STATION_TIMES_MEN_OPEN = {
  skierg: [340, 300, 275, 255],
  sled_push: [310, 240, 200, 170],
  sled_pull: [280, 220, 185, 160],
  burpee_bj: [290, 240, 205, 180],
  row: [270, 245, 225, 210],
  farmers_carry: [180, 155, 135, 120],
  sandbag_lunge: [280, 235, 200, 175],
  wall_balls: [390, 320, 270, 235],
};

const RACE_ORDER = [
  ["run_1", "Run 1 (1 km)", "run"],
  ["skierg", "SkiErg (1000 m)", "station"],
  ["run_2", "Run 2 (1 km)", "run"],
  ["sled_push", "Sled Push (50 m)", "station"],
  ["run_3", "Run 3 (1 km)", "run"],
  ["sled_pull", "Sled Pull (50 m)", "station"],
  ["run_4", "Run 4 (1 km)", "run"],
  ["burpee_bj", "Burpee Broad Jump (80 m)", "station"],
  ["run_5", "Run 5 (1 km)", "run"],
  ["row", "Row (1000 m)", "station"],
  ["run_6", "Run 6 (1 km)", "run"],
  ["farmers_carry", "Farmers Carry (200 m)", "station"],
  ["run_7", "Run 7 (1 km)", "run"],
  ["sandbag_lunge", "Sandbag Lunge (100 m)", "station"],
  ["run_8", "Run 8 (1 km)", "run"],
  ["wall_balls", "Wall Balls (100 reps)", "station"],
];

const RELATIVE_THRESHOLDS = {
  deadlift: [1.0, 1.5, 2.0],
  backSquat: [0.9, 1.3, 1.7],
};

const ABSOLUTE_THRESHOLDS = {
  deadlift: [80, 120, 160],
  backSquat: [70, 100, 140],
};

const ABSOLUTE_WEIGHTED = new Set(["sled_push", "sled_pull"]);
const RELATIVE_WEIGHTED = new Set(["wall_balls", "sandbag_lunge", "burpee_bj"]);

export function runPredictionEngine(request) {
  const { athlete = {}, benchmarks = {}, context = {}, race = {} } = request ?? {};
  const { sex = "male", division = "open" } = athlete;

  const confidenceScore = calculateConfidenceScore(benchmarks, context);
  const confidenceLabel = labelForScore(confidenceScore);
  const predictionMode = modeForScore(confidenceScore);
  const strengthProfile = computeStrengthProfile(benchmarks, sex, benchmarks.bodyweightKg);
  const runPacePerKm = estimateRunPace(benchmarks, context, strengthProfile);
  const segments = buildSegments(benchmarks, context, sex, division, runPacePerKm, strengthProfile);
  const totals = sumTotals(segments, division);
  const predictedTotal = Math.max(totals.total, 4500);
  const range = buildRange(predictedTotal, confidenceScore);
  const topLimiters = identifyLimiters(segments, sex, division);
  const topOpportunities = identifyOpportunities(segments, sex, division);
  const keyAssumptions = buildKeyAssumptions(benchmarks, context);
  const targetComparison = buildTargetComparison(predictedTotal, race?.targetFinishTimeSeconds);

  return {
    predictionId: Date.now().toString(16),
    predictedFinishSeconds: predictedTotal,
    predictedFinishFormatted: formatSec(predictedTotal),
    rangeLowSeconds: range.low,
    rangeLowFormatted: formatSec(range.low),
    rangeHighSeconds: range.high,
    rangeHighFormatted: formatSec(range.high),
    confidenceScore,
    confidenceLabel,
    predictionMode,
    segments,
    topLimiters,
    topOpportunities,
    targetComparison,
    keyAssumptions,
    predictionVersion: "v1.0",
  };
}

export function calculateConfidenceScore(benchmarks = {}, context = {}) {
  let score = 0.35;
  if (benchmarks.run5kSeconds) score += 0.12;
  if (benchmarks.run10kSeconds) score += 0.08;
  if (benchmarks.backSquat3RM) score += 0.08;
  if (benchmarks.deadlift3RM) score += 0.08;
  if (benchmarks.bodyweightKg) score += 0.05;
  if (benchmarks.rowErg2kSeconds || benchmarks.skiErg1kSeconds) score += 0.07;
  if (benchmarks.wallBallRepsIn2Min) score += 0.06;
  if (benchmarks.farmerCarryTimeSeconds) score += 0.05;
  if (context.trainingFrequency) score += 0.03;
  if (context.primaryBackground) score += 0.04;
  if (context.weeklyRunningKm) score += 0.04;
  if (benchmarks.previousHyroxSeconds) score += 0.10;
  return Math.min(0.9, Number(score.toFixed(2)));
}

export function labelForScore(score) {
  if (score < 0.45) return "low";
  if (score < 0.65) return "moderate";
  if (score < 0.8) return "good";
  return "high";
}

export function modeForScore(score) {
  if (score <= 0.5) return "minimum";
  if (score <= 0.7) return "better";
  return "best";
}

// ABSOLUTE_THRESHOLDS/RELATIVE_THRESHOLDS are calibrated for a 3-rep max. Athletes can log
// their squat/deadlift at any rep count from 1-10, so convert to a 3RM-equivalent load first
// (Epley 1RM estimate, then back down to 3RM) - reps defaults to 3 (identity) when omitted,
// so callers that don't pass a rep count keep today's exact behavior.
function epleyOneRepMax(weightKg, reps) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return weightKg;
  const repCount = Number.isInteger(reps) && reps >= 1 && reps <= 10 ? reps : 3;
  if (repCount === 1) return weightKg;
  return weightKg * (1 + repCount / 30);
}

export function estimateOneRepMax(weightKg, reps) {
  return epleyOneRepMax(weightKg, reps);
}

export function estimateThreeRepMax(weightKg, reps) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return weightKg;
  const repCount = Number.isInteger(reps) && reps >= 1 && reps <= 10 ? reps : 3;
  if (repCount === 3) return weightKg;
  return epleyOneRepMax(weightKg, reps) / (1 + 3 / 30);
}

export function computeStrengthProfile(benchmarks = {}, sex = "male", bodyweightKg) {
  const scale = sex === "female" ? 0.75 : 1;
  const absoluteTiers = [];
  const relativeTiers = [];
  const hasBodyweight = Number.isFinite(bodyweightKg) && bodyweightKg > 0;
  const deadlift3RM = estimateThreeRepMax(benchmarks.deadlift3RM, benchmarks.deadliftReps);
  const backSquat3RM = estimateThreeRepMax(benchmarks.backSquat3RM, benchmarks.backSquatReps);

  if (deadlift3RM) {
    absoluteTiers.push(tierForLoad(deadlift3RM, ABSOLUTE_THRESHOLDS.deadlift.map((v) => v * scale)));
    if (hasBodyweight) relativeTiers.push(tierForLoad(deadlift3RM / bodyweightKg, RELATIVE_THRESHOLDS.deadlift.map((v) => v * scale)));
  }
  if (backSquat3RM) {
    absoluteTiers.push(tierForLoad(backSquat3RM, ABSOLUTE_THRESHOLDS.backSquat.map((v) => v * scale)));
    if (hasBodyweight) relativeTiers.push(tierForLoad(backSquat3RM / bodyweightKg, RELATIVE_THRESHOLDS.backSquat.map((v) => v * scale)));
  }

  const absoluteTier = absoluteTiers.length ? clamp(Math.floor(mean(absoluteTiers)), 1, 4) : 2;
  const relativeTier = relativeTiers.length ? clamp(Math.floor(mean(relativeTiers)), 1, 4) : absoluteTier;
  const blendedTier = clamp(Math.round(absoluteTier * 0.4 + relativeTier * 0.6), 1, 4);

  return { absoluteTier, relativeTier, blendedTier, hasBodyweight };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function tierForSegment(segmentKey, profile) {
  if (ABSOLUTE_WEIGHTED.has(segmentKey)) {
    return clamp(Math.round(profile.absoluteTier * 0.8 + profile.relativeTier * 0.2), 1, 4);
  }
  if (RELATIVE_WEIGHTED.has(segmentKey)) {
    return clamp(Math.round(profile.absoluteTier * 0.3 + profile.relativeTier * 0.7), 1, 4);
  }
  if (segmentKey === "farmers_carry") {
    return clamp(Math.round(profile.absoluteTier * 0.6 + profile.relativeTier * 0.4), 1, 4);
  }
  return profile.blendedTier;
}

export function estimateRunPace(benchmarks = {}, context = {}, strengthProfile) {
  const { run5kSeconds, run10kSeconds } = benchmarks;
  let openPacePerKm;
  if (run5kSeconds && run10kSeconds) {
    const pace5k = run5kSeconds / 5;
    const pace10k = run10kSeconds / 10;
    openPacePerKm = (pace5k * 0.97 + pace10k * 1.02) / 2;
  } else if (run10kSeconds) {
    openPacePerKm = (run10kSeconds / 10) * 1.02;
  } else {
    openPacePerKm = (run5kSeconds / 5) * 1.05;
  }

  const backgroundMultiplier = {
    endurance: 1.12,
    crossfit: 1.15,
    general: 1.18,
    strength: 1.22,
  }[context.primaryBackground] ?? 1.17;

  const volumeAdjustment = {
    "45+": 0.97,
    "30-45": 1,
    "15-30": 1.03,
    "<15": 1.07,
  }[context.weeklyRunningKm] ?? 1.02;

  const bodyweightAdjustment = strengthProfile?.hasBodyweight
    ? { 1: 1.02, 2: 1.0, 3: 1.0, 4: 0.99 }[strengthProfile.relativeTier] ?? 1
    : 1;

  return openPacePerKm * backgroundMultiplier * volumeAdjustment * bodyweightAdjustment;
}

export function buildSegments(benchmarks, context, sex, division, runPacePerKm, strengthProfile) {
  return RACE_ORDER.map(([segmentKey, label, type]) => {
    const predictedSeconds = type === "run"
      ? Math.round(runPacePerKm)
      : stationPrediction(segmentKey, benchmarks, sex, division, runPacePerKm, strengthProfile);
    return {
      segmentKey,
      label,
      type,
      predictedSeconds,
      predictedFormatted: formatSec(predictedSeconds),
      limiterScore: 0,
      opportunityGainSeconds: 0,
    };
  });
}

export function sumTotals(segments, division) {
  const roxzoneSeconds = { open: 360, pro: 300, doubles: 420, relay: 480 }[division] ?? 360;
  const total = segments.reduce((sum, segment) => sum + segment.predictedSeconds, 0) + roxzoneSeconds;
  return { total, roxzone: roxzoneSeconds };
}

export function buildRange(total, confidenceScore) {
  const factor = 0.22 - (confidenceScore * 0.14);
  return {
    low: Math.round(total * (1 - factor)),
    high: Math.round(total * (1 + factor)),
  };
}

export function identifyLimiters(segments, sex, division) {
  for (const segment of segments) {
    const benchmark = tier2BenchmarkForSegment(segment, sex, division);
    const rawScore = Math.max(0, (segment.predictedSeconds - benchmark) / benchmark);
    const weightedScore = rawScore * limiterWeight(segment.segmentKey);
    segment.limiterScore = Number(weightedScore.toFixed(3));
  }
  return [...segments]
    .filter((segment) => segment.limiterScore > 0.05)
    .sort((a, b) => b.limiterScore - a.limiterScore)
    .slice(0, 3);
}

function limiterWeight(segmentKey) {
  if (segmentKey === "wall_balls") return 1.4;
  if (segmentKey === "sled_push" || segmentKey === "sled_pull") return 0.9;
  return 1;
}

export function identifyOpportunities(segments, sex, division) {
  for (const segment of segments) {
    const benchmark = tier2BenchmarkForSegment(segment, sex, division);
    segment.opportunityGainSeconds = Math.max(0, Math.round(segment.predictedSeconds - benchmark));
  }
  return [...segments]
    .filter((segment) => (segment.opportunityGainSeconds ?? 0) > 0)
    .sort((a, b) => (b.opportunityGainSeconds ?? 0) - (a.opportunityGainSeconds ?? 0))
    .slice(0, 3);
}

export function buildKeyAssumptions(benchmarks = {}, context = {}) {
  const assumptions = [];
  if (benchmarks.run5kSeconds && benchmarks.run10kSeconds) {
    assumptions.push("Running pace estimated from your 5k and 10k personal bests");
  } else if (benchmarks.run10kSeconds) {
    assumptions.push("Running pace estimated from your 10k personal best");
  } else {
    assumptions.push("Running pace estimated from your 5k personal best");
  }
  if (!benchmarks.skiErg1kSeconds) {
    assumptions.push("SkiErg time estimated from running pace (no SkiErg benchmark provided)");
  }
  if (!benchmarks.wallBallRepsIn2Min) {
    assumptions.push("Wall ball time estimated from strength tier (no benchmark provided)");
  }
  if (!benchmarks.farmerCarryTimeSeconds) {
    assumptions.push("Farmer's carry time estimated from strength tier");
  }
  if (!benchmarks.rowErg2kSeconds) {
    assumptions.push("Row time estimated from strength tier (no row benchmark provided)");
  }
  if (benchmarks.previousHyroxSeconds) {
    assumptions.push("Previous HYROX time used to calibrate running estimate");
  }
  if (benchmarks.bodyweightKg) {
    assumptions.push("Strength estimates blend your absolute and bodyweight-relative squat/deadlift numbers");
  }
  if (context.primaryBackground || context.weeklyRunningKm) {
    assumptions.push("Training background and running volume used to adjust compromised running pace");
  }
  assumptions.push("Sled push and pull times estimated from strength benchmarks");
  assumptions.push("All estimates include a RoxZone transition time");
  return assumptions;
}

export function buildTargetComparison(predictedTotal, targetSeconds) {
  if (!targetSeconds) return undefined;
  const gapSeconds = targetSeconds - predictedTotal;
  return {
    targetSeconds,
    targetFormatted: formatSec(targetSeconds),
    gapSeconds,
    gapFormatted: formatGap(gapSeconds),
  };
}

function stationPrediction(segmentKey, benchmarks, sex, division, runPacePerKm, strengthProfile) {
  if (segmentKey === "skierg" && benchmarks.skiErg1kSeconds) return Math.round(benchmarks.skiErg1kSeconds);
  if (segmentKey === "row" && benchmarks.rowErg2kSeconds) return Math.round(benchmarks.rowErg2kSeconds * 0.58);
  if (segmentKey === "farmers_carry" && benchmarks.farmerCarryTimeSeconds) return Math.round(benchmarks.farmerCarryTimeSeconds);
  if (segmentKey === "wall_balls" && benchmarks.wallBallRepsIn2Min) {
    return Math.round(clamp((100 / (benchmarks.wallBallRepsIn2Min / 120)) * 1.05, 90, 600));
  }
  if (segmentKey === "skierg") {
    const tier4 = stationLookup("skierg", sex, division, 4);
    const tier1 = stationLookup("skierg", sex, division, 1);
    return Math.round(clamp(runPacePerKm * 0.92, tier4, tier1));
  }
  return stationLookup(segmentKey, sex, division, tierForSegment(segmentKey, strengthProfile));
}

function stationLookup(segmentKey, sex, division, tier) {
  const base = STATION_TIMES_MEN_OPEN[segmentKey]?.[clamp(tier, 1, 4) - 1] ?? 240;
  return Math.round(base * multiplierForGroup(sex, division));
}

function tier2BenchmarkForSegment(segment, sex, division) {
  if (segment.type === "run") return runTier2PacePerKm(sex, division);
  return stationLookup(segment.segmentKey, sex, division, 2);
}

function runTier2PacePerKm(sex, division) {
  let pace = sex === "female" ? 360 : 330;
  if (division === "pro") pace *= 0.95;
  if (division === "doubles") pace *= 1.05;
  if (division === "relay") pace *= 1.08;
  return pace;
}

function multiplierForGroup(sex, division) {
  let multiplier = sex === "female" ? 1.08 : 1;
  if (division === "pro") multiplier *= 0.9;
  if (division === "doubles" || division === "relay") multiplier *= 1.05;
  return multiplier;
}

function tierForLoad(value, thresholds) {
  if (value < thresholds[0]) return 1;
  if (value <= thresholds[1]) return 2;
  if (value <= thresholds[2]) return 3;
  return 4;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatSec(seconds) {
  const rounded = Math.round(seconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatGap(seconds) {
  const sign = seconds >= 0 ? "+" : "-";
  return `${sign}${formatSec(Math.abs(seconds))}`;
}
