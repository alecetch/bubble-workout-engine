/**
 * Running & Hybrid Performance Profiler — analysis engine.
 * Pure function: takes structured input, returns analysis object.
 */

const RECENCY_WEIGHTS = {
  current: 1.0,
  within_6_months: 0.9,
  "6_18_months": 0.65,
  historic: 0.25,
};

// Approximate HYROX open running contribution ratio for projection
// (rough: HYROX total ≈ run_time * 1.6 for a balanced athlete)
const HYROX_RUN_MULTIPLIER = 1.6;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function recencyWeight(recency) {
  return RECENCY_WEIGHTS[recency] ?? 0.25;
}

function metersPerSecond(timeSeconds, distanceMeters) {
  if (!timeSeconds || timeSeconds <= 0 || !distanceMeters) return null;
  return distanceMeters / timeSeconds;
}

function distanceMeters(distance) {
  const map = { "5k": 5000, "10k": 10000, half_marathon: 21097.5, marathon: 42195 };
  return map[distance] ?? null;
}

function secPer400(timeSeconds, distance) {
  const dm = distanceMeters(distance);
  if (!dm || !timeSeconds) return null;
  return (timeSeconds / dm) * 400;
}

/**
 * Find the best (fastest) performance for a given distance, weighted by recency.
 * Returns { performance, weightedSeconds } or null.
 */
function bestWeighted(performances, distance) {
  const matches = performances.filter((p) => p.distance === distance && p.timeSeconds > 0);
  if (!matches.length) return null;
  let best = null;
  for (const p of matches) {
    const w = recencyWeight(p.recency);
    const weighted = p.timeSeconds / w; // lower = faster at recency-adjusted pace
    if (best === null || weighted < best.weighted) {
      best = { performance: p, weightedSeconds: weighted, rawSeconds: p.timeSeconds };
    }
  }
  return best;
}

/**
 * Determine confidence level from performances.
 */
function computeConfidence(performances) {
  const hasCurrent = performances.some((p) => p.recency === "current");
  if (hasCurrent) return "high";
  const hasRecent = performances.some(
    (p) => p.recency === "current" || p.recency === "within_6_months",
  );
  if (hasRecent) return "medium";
  return "low";
}

/**
 * Volume sufficiency for goals.
 * Returns: 'sufficient' | 'borderline' | 'insufficient'
 */
function volumeSufficiency(weeklyRunningVolume, primaryGoals) {
  const volumeMap = {
    "0_10": 5,
    "11_20": 15,
    "21_35": 28,
    "36_50": 43,
    "51_70": 60,
    "70_plus": 75,
  };
  const volKm = volumeMap[weeklyRunningVolume] ?? 0;
  const wantsHyrox = primaryGoals?.includes("improve_hyrox");
  const wantsFast5k10k = primaryGoals?.includes("get_faster_5k_10k");
  const wantsMuscle = primaryGoals?.includes("maintain_build_muscle");

  if (wantsFast5k10k) {
    if (volKm >= 36) return "sufficient";
    if (volKm >= 21) return "borderline";
    return "insufficient";
  }
  if (wantsHyrox) {
    if (volKm >= 21) return "sufficient";
    if (volKm >= 11) return "borderline";
    return "insufficient";
  }
  if (wantsMuscle && volKm <= 10) return "sufficient"; // minimal running ok for muscle focus
  if (volKm >= 11) return "sufficient";
  return "borderline";
}

/**
 * Running/strength balance risk flag.
 */
function hasBalanceRisk(trainingProfile) {
  const { strengthSessionsPerWeek, weeklyRunningVolume, primaryGoals } = trainingProfile;
  const highStrength = ["4_5", "6_plus"].includes(strengthSessionsPerWeek);
  const lowVolume = ["0_10"].includes(weeklyRunningVolume);
  const wantsHyrox = primaryGoals?.includes("improve_hyrox");
  return highStrength && lowVolume && wantsHyrox;
}

/**
 * Project HYROX finish time from 5k pace (rough approximation).
 * Returns seconds or null.
 */
function projectHyroxFromRunning(best5k, best10k) {
  const ref = best5k ?? best10k;
  if (!ref) return null;
  const dist = best5k ? 5000 : 10000;
  const pace = ref.rawSeconds / (dist / 1000); // sec/km
  // Estimated 8km run in HYROX ≈ pace * 8, work ≈ run_time * 0.6
  const estimatedRunTotal = pace * 8;
  return Math.round(estimatedRunTotal * HYROX_RUN_MULTIPLIER);
}

/**
 * Compute performance scores (0–100).
 */
function computeScores(best5k, best10k, bestHalfMarathon, trainingProfile, context) {
  // Running capacity: based on 5k pace benchmark
  let runningCapacityScore = 50;
  if (best5k) {
    const paceSecPerKm = best5k.rawSeconds / 5;
    const w = recencyWeight(best5k.performance.recency);
    // Sub-4:00/km = elite (≈100), 8:00/km = beginner (≈10)
    const raw = Math.max(10, Math.min(100, Math.round(100 - ((paceSecPerKm - 240) / 240) * 90)));
    runningCapacityScore = Math.round(raw * w + 50 * (1 - w));
  } else if (best10k) {
    const paceSecPerKm = best10k.rawSeconds / 10;
    const w = recencyWeight(best10k.performance.recency);
    const raw = Math.max(10, Math.min(100, Math.round(100 - ((paceSecPerKm - 270) / 270) * 90)));
    runningCapacityScore = Math.round(raw * w + 50 * (1 - w));
  }

  // Strength power score: inferred from sessions per week
  const strengthMap = { "0_1": 30, "2_3": 55, "4_5": 75, "6_plus": 85 };
  const strengthPowerScore = strengthMap[trainingProfile.strengthSessionsPerWeek] ?? 50;

  // Endurance durability: inferred from long-distance data
  let enduranceDurabilityScore = null;
  if (bestHalfMarathon) {
    const paceSecPerKm = bestHalfMarathon.rawSeconds / 21.1;
    const w = recencyWeight(bestHalfMarathon.performance.recency);
    const raw = Math.max(10, Math.min(100, Math.round(100 - ((paceSecPerKm - 300) / 300) * 90)));
    enduranceDurabilityScore = Math.round(raw * w + 50 * (1 - w));
  }

  // Running economy: speed reserve proxy (5k/10k ratio)
  let runningEconomyScore = null;
  if (best5k && best10k) {
    const pace5k = best5k.rawSeconds / 5;
    const pace10k = best10k.rawSeconds / 10;
    const ratio = pace5k / pace10k;
    // Ideal ratio ≈ 1.04–1.08; >1.12 = limited threshold dev
    if (ratio <= 1.08) runningEconomyScore = 80;
    else if (ratio <= 1.12) runningEconomyScore = 65;
    else runningEconomyScore = 45;
  }

  // Balance score: harmony between running and strength
  let balanceScore = 60;
  if (hasBalanceRisk(trainingProfile)) balanceScore = 30;
  const vol = trainingProfile.weeklyRunningVolume;
  if (["21_35", "36_50"].includes(vol)) balanceScore = Math.min(balanceScore + 15, 90);
  if (["0_10"].includes(vol) && trainingProfile.primaryGoals?.includes("get_faster_5k_10k")) {
    balanceScore = Math.max(balanceScore - 20, 20);
  }

  // Overall: weighted combination
  const scores = [runningCapacityScore, strengthPowerScore, enduranceDurabilityScore, runningEconomyScore, balanceScore].filter(Number.isFinite);
  const overallPerformanceScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  return {
    overallPerformanceScore,
    runningCapacityScore,
    strengthPowerScore,
    enduranceDurabilityScore,
    runningEconomyScore,
    balanceScore,
  };
}

/**
 * Build limiters list based on profile and analysis.
 */
function buildLimiters(trainingProfile, context, scores, best5k, best10k) {
  const limiters = [];

  if (scores.runningCapacityScore < 50) {
    limiters.push({
      rank: limiters.length + 1,
      title: "Running Capacity",
      impact: "high",
      why: "Your current running times indicate there is meaningful room to develop aerobic base and pace. This is your most direct lever for performance gains.",
    });
  }

  if (hasBalanceRisk(trainingProfile)) {
    limiters.push({
      rank: limiters.length + 1,
      title: "Run/Strength Imbalance",
      impact: "high",
      why: "You have high strength training volume but low running volume. For HYROX performance, inadequate running base will cap your race results regardless of station strength.",
    });
  }

  if (scores.runningEconomyScore !== null && scores.runningEconomyScore < 60) {
    limiters.push({
      rank: limiters.length + 1,
      title: "Threshold Development",
      impact: "medium",
      why: "Your 5k-to-10k pace ratio suggests limited lactate threshold capacity. Threshold work at 10k–half marathon effort could unlock meaningful pace improvements.",
    });
  }

  const volMap = { "0_10": 5, "11_20": 15, "21_35": 28, "36_50": 43, "51_70": 60, "70_plus": 75 };
  const volKm = volMap[trainingProfile.weeklyRunningVolume] ?? 0;
  const wantsFaster = trainingProfile.primaryGoals?.includes("get_faster_5k_10k");
  if (wantsFaster && volKm < 21 && context.currentConcern !== "running_hurts_strength_muscle") {
    limiters.push({
      rank: limiters.length + 1,
      title: "Training Volume",
      impact: "medium",
      why: "To meaningfully improve 5k/10k times, a weekly volume of 21–35km is a useful foundation. Your current volume may be limiting adaptation.",
    });
  }

  if (context.injuryLimitations && context.injuryLimitations !== "no") {
    limiters.push({
      rank: limiters.length + 1,
      title: "Injury Risk / Structural Limitation",
      impact: "medium",
      why: `You've noted ${context.injuryLimitations.replace(/_/g, " ")} as a concern. Prioritise load management and consider lower-impact modalities to protect training continuity. This is not medical advice — consult a professional for your specific situation.`,
    });
  }

  // Cap at 5 limiters, assign final ranks
  return limiters.slice(0, 5).map((l, i) => ({ ...l, rank: i + 1 }));
}

/**
 * Build recommendations from limiters + context.
 */
function buildRecommendations(trainingProfile, context, scores, limiters) {
  const recs = [];

  // Concern-aware: running hurts strength/muscle
  if (context.currentConcern === "running_hurts_strength_muscle") {
    recs.push({
      rank: 1,
      title: "Separate Running and Strength Days",
      impact: "high",
      why: "Concurrent training on the same day blunts the adaptation signal for both. Scheduling strength and key runs 24h apart preserves gains in both modalities.",
      example: "Lift Mon/Wed/Fri. Run Tue/Thu/Sat. Keep Sunday as full rest or mobility.",
    });
  }

  // Threshold work if economy is low
  if (scores.runningEconomyScore !== null && scores.runningEconomyScore < 65 && recs.length < 3) {
    recs.push({
      rank: recs.length + 1,
      title: "Threshold Work",
      impact: "high",
      why: "Improving your lactate threshold pace is the highest-ROI lever for your 5k–10k times and HYROX run legs. One threshold session per week is sufficient.",
      example: "20–30 min at 'comfortably hard' 10k–half marathon effort. E.g. 6×800m at 10k pace with 90s recovery.",
    });
  }

  // Injury-related: emphasise lower impact
  if (context.injuryLimitations && ["knee_ankle_foot", "hip_back"].includes(context.injuryLimitations) && recs.length < 3) {
    recs.push({
      rank: recs.length + 1,
      title: "Durability / Joint-Friendly Conditioning",
      impact: "medium",
      why: "With joint limitations, prioritise quality over quantity. Lower-impact aerobic work (SkiErg, bike, pool running) builds base without compounding joint stress.",
      example: "Replace 1–2 road runs with SkiErg or cycling sessions of equivalent duration. Consult a physiotherapist for your specific case.",
    });
  }

  // Compromised running for hybrid athletes
  if (trainingProfile.backgrounds?.some((b) => ["hyrox", "strength_training", "crossfit"].includes(b)) && scores.runningCapacityScore < 60 && recs.length < 3) {
    recs.push({
      rank: recs.length + 1,
      title: "Compromised Running",
      impact: "high",
      why: "As a hybrid athlete, your goal is to run fast after heavy work — not just run fast. Brick sessions (strength then run) train this specific adaptation.",
      example: "After your regular strength session, add a 15–20 min tempo run. Start at 2× per month, build to weekly.",
    });
  }

  // Volume for HYROX goal
  if (trainingProfile.primaryGoals?.includes("improve_hyrox") && scores.runningCapacityScore < 65 && recs.length < 3) {
    recs.push({
      rank: recs.length + 1,
      title: "Strength Endurance",
      impact: "medium",
      why: "For HYROX performance, strength-endurance (not raw strength) is what transfers to the race floor. High-rep functional work under fatigue is key.",
      example: "Station-specific circuits: 3–5 rounds of sled push + pull + farmer carry. Minimal rest. Build time-under-tension at race pace.",
    });
  }

  // Recovery & muscle retention for masters athletes
  if (trainingProfile.primaryGoals?.includes("maintain_build_muscle") && recs.length < 3) {
    recs.push({
      rank: recs.length + 1,
      title: "Recovery & Muscle Retention",
      impact: "medium",
      why: "High running volume suppresses anabolic signalling. For muscle retention, lower-volume/higher-intensity running (1–2 quality sessions) beats long slow distance.",
      example: "Replace long easy runs with 2 shorter quality runs (tempo + interval). Ensure 48h before/after heavy compound lifting.",
    });
  }

  // Fallback: running economy
  if (recs.length < 1) {
    recs.push({
      rank: 1,
      title: "Running Economy",
      impact: "medium",
      why: "Even small improvements in running efficiency reduce energy cost at race pace. Strides, drills, and cadence work pay dividends with minimal injury risk.",
      example: "Add 6×20s strides (controlled fast) at end of easy runs twice a week. Focus on light ground contact and tall posture.",
    });
  }

  return recs.slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Describe trade-off outlook as a paragraph.
 */
function tradeOffOutlook(trainingProfile, context, scores) {
  const wantsMuscle = trainingProfile.primaryGoals?.includes("maintain_build_muscle");
  const highVol = ["36_50", "51_70", "70_plus"].includes(trainingProfile.weeklyRunningVolume);

  if (wantsMuscle && highVol) {
    return "You are running a significant volume alongside a muscle retention goal. High aerobic load suppresses mTOR-mediated muscle protein synthesis. The smarter lever here is improving quality of running (threshold and interval) rather than adding volume — you'll get more performance upside with less interference to strength and muscle.";
  }
  if (hasBalanceRisk(trainingProfile)) {
    return "Your current profile shows a high strength training load but limited running volume. For HYROX, this balance puts you at risk of being strong at the stations but fading on the run legs. A moderate and consistent weekly run volume is the priority shift.";
  }
  if (context.currentConcern === "running_hurts_strength_muscle") {
    return "The tension between running and muscle retention is real but manageable. The key is sequencing — not elimination. Running does not need to undermine your muscle goal if sessions are separated by adequate recovery and running volume is moderate.";
  }
  return "Your current training mix appears reasonably balanced for your goals. Focus on quality rather than volume increases — targeted threshold and strength-endurance work will give you more upside than simply running more or lifting heavier.";
}

/**
 * Generate a key insight sentence.
 */
function buildKeyInsight(scores, limiters, trainingProfile, best5k, best10k) {
  const topLimiter = limiters[0];
  if (topLimiter?.title === "Run/Strength Imbalance") {
    return "Your biggest opportunity is not a faster pace — it's building an adequate running base to support your strength. Adding 10–15km of quality weekly running would have the highest impact on your HYROX performance right now.";
  }
  if (scores.runningCapacityScore >= 70 && scores.balanceScore >= 60) {
    return "Your running capacity is a genuine asset. The priority now is ensuring it transfers to hybrid performance through compromised running and strength-endurance work — not further pace development in isolation.";
  }
  if (best5k) {
    const paceMin = Math.floor(best5k.rawSeconds / 5 / 60);
    const paceSec = Math.round((best5k.rawSeconds / 5) % 60);
    return `Your 5k pace (${paceMin}:${String(paceSec).padStart(2, "0")}/km) places you in a range where targeted threshold and compromised running work will drive meaningful gains without adding significant injury risk.`;
  }
  return "With more recent race data we can sharpen this analysis — but your training profile already suggests clear priority areas for performance improvement.";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function analyseRunningProfile({ athlete, trainingProfile, performances, context }) {
  const best5k = bestWeighted(performances, "5k");
  const best10k = bestWeighted(performances, "10k");
  const bestHalf = bestWeighted(performances, "half_marathon");

  const confidence = computeConfidence(performances);
  const scores = computeScores(best5k, best10k, bestHalf, trainingProfile, context);
  const limiters = buildLimiters(trainingProfile, context, scores, best5k, best10k);
  const recommendations = buildRecommendations(trainingProfile, context, scores, limiters);

  const projectedHyroxSeconds = projectHyroxFromRunning(best5k, best10k);

  // HYROX running capacity for goal
  let runningCapacityForGoal = null;
  if (context.targetHyroxSeconds && projectedHyroxSeconds) {
    const gap = projectedHyroxSeconds - context.targetHyroxSeconds;
    if (gap <= 0) runningCapacityForGoal = "sufficient";
    else if (gap <= 600) runningCapacityForGoal = "borderline";
    else runningCapacityForGoal = "insufficient";
  }

  // Performance notes
  const historicResults = performances.filter((p) => p.recency === "historic");
  const performanceNotes = historicResults.length > 0
    ? `${historicResults.length} historic result(s) included as context only. Not used as primary predictors.`
    : null;

  // Target gaps
  const gaps = {};
  if (context.target5kSeconds && best5k) {
    gaps.fiveK = { target: context.target5kSeconds, current: best5k.rawSeconds, gapSeconds: best5k.rawSeconds - context.target5kSeconds };
  }
  if (context.target10kSeconds && best10k) {
    gaps.tenK = { target: context.target10kSeconds, current: best10k.rawSeconds, gapSeconds: best10k.rawSeconds - context.target10kSeconds };
  }
  if (context.targetHyroxSeconds && projectedHyroxSeconds) {
    gaps.hyrox = { target: context.targetHyroxSeconds, projected: projectedHyroxSeconds, gapSeconds: projectedHyroxSeconds - context.targetHyroxSeconds };
  }

  return {
    confidence,
    analysis: {
      ...scores,
      keyInsight: buildKeyInsight(scores, limiters, trainingProfile, best5k, best10k),
      limiters,
      performanceTranslation: {
        projectedHyroxSeconds: trainingProfile.primaryGoals?.includes("improve_hyrox") ? projectedHyroxSeconds : null,
        projectedHyroxLabel: projectedHyroxSeconds ? `~${Math.floor(projectedHyroxSeconds / 60)}:${String(projectedHyroxSeconds % 60).padStart(2, "0")}` : null,
        runningCapacityForGoal,
        note: projectedHyroxSeconds
          ? "Projection based on 5k/10k pace using estimated running contribution. Does not account for strength station performance."
          : "Insufficient running data for HYROX projection.",
        targetGaps: gaps,
        performanceNotes,
      },
      tradeOffOutlook: tradeOffOutlook(trainingProfile, context, scores),
      recommendations,
      volumeSufficiency: volumeSufficiency(trainingProfile.weeklyRunningVolume, trainingProfile.primaryGoals),
      balanceRisk: hasBalanceRisk(trainingProfile),
    },
  };
}
