import { MUSCLE_GROUP_MAP } from "../config/muscleGroupMap.js";
import { formatGain, formatPercent, formatPercentile, formatTime, label } from "../reports/copyFormatter.js";

const DEFAULT_SECTION_ORDER = Object.freeze([
  "executive_summary",
  "race_snapshot",
  "biggest_strength",
  "station_breakdown",
  "split_table",
  "time_potential",
  "muscle_group",
  "running_fatigue",
  "training_volume",
  "background_context",
  "roxzone_execution",
  "recommendations",
]);

const PENALTY_SECTION_ORDER = Object.freeze([
  "executive_summary",
  "race_snapshot",
  "penalty_callout",
  "station_breakdown",
  "running_fatigue",
  "split_table",
  "muscle_group",
  "roxzone_execution",
  "time_potential",
  "training_volume",
  "background_context",
  "recommendations",
]);

const RUNNING_SECTION_ORDER = Object.freeze([
  "executive_summary",
  "race_snapshot",
  "running_fatigue",
  "station_breakdown",
  "split_table",
  "time_potential",
  "roxzone_execution",
  "muscle_group",
  "training_volume",
  "background_context",
  "recommendations",
]);

const ROXZONE_SECTION_ORDER = Object.freeze([
  "executive_summary",
  "race_snapshot",
  "roxzone_execution",
  "station_breakdown",
  "running_fatigue",
  "split_table",
  "time_potential",
  "muscle_group",
  "training_volume",
  "background_context",
  "recommendations",
]);

const MUSCLE_BY_SEGMENT = new Map(MUSCLE_GROUP_MAP.map((row) => [row.segmentKey, row]));

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function totalPenaltySeconds(analysisJson = {}) {
  return (analysisJson.penalties ?? [])
    .reduce((sum, p) => sum + (Number(p.penaltySeconds) || 0), 0);
}

export function totalStationGapSeconds(analysisJson = {}) {
  return (analysisJson.stationBreakdown ?? [])
    .filter((s) => s.confidence !== "low" && s.timeGapSeconds > 0)
    .reduce((sum, s) => sum + s.timeGapSeconds, 0);
}

export function totalRunGapSeconds(analysisJson = {}) {
  return (analysisJson.segments ?? [])
    .filter((s) => s.type === "run" && Number.isFinite(s.timeGapToMedianSeconds) && s.timeGapToMedianSeconds > 0)
    .reduce((sum, s) => sum + s.timeGapToMedianSeconds, 0);
}

export function weakStationCount(analysisJson = {}) {
  return (analysisJson.stationBreakdown ?? [])
    .filter((s) => s.confidence !== "low" && (s.percentile == null || s.percentile < 50))
    .length;
}

function runPercentile(analysisJson = {}) {
  const aggregate = (analysisJson.segments ?? []).find((s) => s.segmentKey === "run_time");
  return finiteNumber(aggregate?.percentile);
}

function benchmarkConfidence(analysisJson = {}) {
  return analysisJson.benchmarkConfidence
    ?? analysisJson.benchmarkContext?.confidence
    ?? analysisJson.dataQuality?.confidence
    ?? (analysisJson.analysisScope === "no_benchmark_data" ? "low" : null);
}

function roxzoneGap(analysisJson = {}) {
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const segment = (analysisJson.segments ?? []).find((s) => s.segmentKey === "roxzone_time");
  return finiteNumber(rox.timeGapToMedianSeconds) ?? finiteNumber(segment?.timeGapToMedianSeconds) ?? 0;
}

function limiter(analysisJson = {}) {
  return analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
}

function limiterLabel(analysisJson = {}) {
  return limiter(analysisJson)?.label ?? "Your result";
}

function headlineGainSeconds(analysisJson = {}) {
  return finiteNumber(analysisJson.timePotential?.headlineGainSeconds)
    ?? finiteNumber(limiter(analysisJson)?.timeGapSeconds)
    ?? null;
}

function stationThesisEvidence(analysisJson = {}) {
  const stationGap = totalStationGapSeconds(analysisJson);
  return `${limiterLabel(analysisJson)} leads your station gap at ${formatGain(stationGap) ?? "a measurable gap"}.`;
}

function thesis(category, analysisJson = {}, overrides = {}) {
  const penalty = totalPenaltySeconds(analysisJson);
  const stationGap = totalStationGapSeconds(analysisJson);
  const runGap = totalRunGapSeconds(analysisJson);
  const runFade = finiteNumber(analysisJson.runningAnalysis?.runFadePct);
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const roxPct = finiteNumber(rox.percentile);
  const base = {
    id: category,
    category,
    headline: category,
    evidenceSummary: "No single evidence point was available.",
    estimatedImpactSeconds: null,
    copyAngle: "context",
    confidence: "medium",
  };

  if (category === "penalty") {
    return {
      ...base,
      headline: "Penalty time is the fastest win",
      evidenceSummary: `${formatGain(penalty)} in penalties were recorded.`,
      estimatedImpactSeconds: penalty,
      copyAngle: "urgent_fix",
      confidence: penalty >= 180 ? "high" : "medium",
      ...overrides,
    };
  }
  if (category === "station_capacity") {
    return {
      ...base,
      headline: "Station capacity is the biggest limiter",
      evidenceSummary: stationThesisEvidence(analysisJson),
      estimatedImpactSeconds: stationGap || headlineGainSeconds(analysisJson),
      copyAngle: "next_block",
      confidence: weakStationCount(analysisJson) >= 2 ? "high" : "medium",
      ...overrides,
    };
  }
  if (category === "running") {
    return {
      ...base,
      headline: "Running gap is bigger than station gap",
      evidenceSummary: `The cumulative run gap (${formatGain(runGap)}) exceeds station gap (${formatGain(stationGap)}).`,
      estimatedImpactSeconds: runGap,
      copyAngle: "next_block",
      confidence: "high",
      ...overrides,
    };
  }
  if (category === "roxzone") {
    return {
      ...base,
      headline: "Transition leakage is costing time",
      evidenceSummary: `Roxzone performance is ${formatPercentile(roxPct) ?? "below target"} with a ${formatGain(roxzoneGap(analysisJson))} gap.`,
      estimatedImpactSeconds: roxzoneGap(analysisJson),
      copyAngle: "race_strategy",
      confidence: "high",
      ...overrides,
    };
  }
  if (category === "pacing") {
    return {
      ...base,
      headline: "Pacing under fatigue is the unlock",
      evidenceSummary: `Run fade was ${formatPercent(runFade)}.`,
      estimatedImpactSeconds: runGap || null,
      copyAngle: "race_strategy",
      confidence: "medium",
      ...overrides,
    };
  }
  if (category === "data_quality") {
    return {
      ...base,
      headline: "Benchmark confidence is limited",
      evidenceSummary: "Benchmark data was limited, so target comparisons should be treated as directional.",
      estimatedImpactSeconds: null,
      copyAngle: "context",
      confidence: "low",
      ...overrides,
    };
  }
  return { ...base, ...overrides };
}

export function selectPrimaryCategory(analysisJson = {}) {
  const penalty = totalPenaltySeconds(analysisJson);
  const stationGap = totalStationGapSeconds(analysisJson);
  const runGap = totalRunGapSeconds(analysisJson);
  const weakCount = weakStationCount(analysisJson);
  const runFade = finiteNumber(analysisJson.runningAnalysis?.runFadePct) ?? 0;
  const runPct = runPercentile(analysisJson);
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const roxPct = finiteNumber(rox.percentile);
  const roxGap = roxzoneGap(analysisJson);
  const confidence = benchmarkConfidence(analysisJson);
  const segmentCount = (analysisJson.segments ?? []).length;

  if (penalty >= 180 && penalty > stationGap * 0.5) return "penalty";
  if (stationGap > runGap && weakCount >= 2) return "station_capacity";
  if (runGap > stationGap && (runFade >= 8 || (runPct != null && runPct < 45))) return "running";
  if (roxPct != null && roxPct < 35 && roxGap > 90) return "roxzone";
  if (runFade >= 10 && weakCount < 2) return "pacing";
  if (confidence === "low" || segmentCount < 4) return "data_quality";
  return stationGap >= runGap ? "station_capacity" : "running";
}

function buildPenaltyInterpretation(analysisJson = {}) {
  const total = totalPenaltySeconds(analysisJson);
  if (total <= 0) return null;
  const finish = finiteNumber(analysisJson.race?.finishTimeSeconds);
  const adjusted = finish != null ? Math.max(0, finish - total) : null;
  const largestStation = Math.max(0, ...(analysisJson.stationBreakdown ?? []).map((s) => Number(s.timeGapSeconds) || 0));
  return {
    totalPenaltySeconds: total,
    costRank: total >= largestStation ? "largest_single_opportunity" : total >= 120 ? "major_opportunity" : "minor_opportunity",
    adjustedFinishTime: adjusted != null ? formatTime(adjusted) : null,
    recommendedCopyAngle: total >= 180 ? "execution_first" : "technique_under_fatigue",
  };
}

function buildSecondaryTheses(primary, analysisJson = {}) {
  const items = [];
  const penalty = totalPenaltySeconds(analysisJson);
  if (penalty >= 60 && primary !== "penalty") items.push(thesis("penalty", analysisJson));
  const stationGap = totalStationGapSeconds(analysisJson);
  const runGap = totalRunGapSeconds(analysisJson);
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const roxPct = finiteNumber(rox.percentile);
  if (primary !== "station_capacity" && stationGap > 60 && weakStationCount(analysisJson) >= 2) items.push(thesis("station_capacity", analysisJson));
  if (primary !== "running" && runGap > 60 && (analysisJson.runningAnalysis?.runFadePct ?? 0) >= 8) items.push(thesis("running", analysisJson));
  if (primary !== "roxzone" && roxPct != null && roxPct < 45 && roxzoneGap(analysisJson) >= 30) items.push(thesis("roxzone", analysisJson));
  return items.slice(0, 2);
}

function protectedStrengths(analysisJson = {}) {
  const stations = (analysisJson.stationBreakdown ?? []).filter((s) => s.confidence !== "low" && Number.isFinite(s.percentile));
  if (stations.length === 0) return [];
  const topGapKeys = new Set([...stations]
    .filter((s) => Number(s.timeGapSeconds) > 0)
    .sort((a, b) => b.timeGapSeconds - a.timeGapSeconds)
    .slice(0, 3)
    .map((s) => s.segmentKey));
  const best = [...stations]
    .filter((s) => !topGapKeys.has(s.segmentKey))
    .sort((a, b) => a.percentile - b.percentile)[0];
  if (!best || best.percentile >= 50) return [];
  return [thesis("station_capacity", analysisJson, {
    id: `protect_${best.segmentKey ?? "station"}`,
    category: "station_capacity",
    headline: `${best.label} is worth protecting`,
    evidenceSummary: `${best.label} is your strongest protected station at ${formatPercentile(best.percentile)}.`,
    estimatedImpactSeconds: null,
    copyAngle: "protect_strength",
    confidence: "medium",
  })];
}

function muscleGroupConfidence(analysisJson = {}) {
  const weak = (analysisJson.stationBreakdown ?? [])
    .filter((s) => s.confidence !== "low" && (s.percentile == null || s.percentile < 50));
  if (weak.length === 0) return "none";
  const counters = new Map();
  const secondaryCounters = new Map();
  for (const station of weak) {
    const mapping = MUSCLE_BY_SEGMENT.get(station.segmentKey);
    for (const group of mapping?.primary ?? []) counters.set(group, (counters.get(group) ?? 0) + 1);
    for (const group of mapping?.secondary ?? []) secondaryCounters.set(group, (secondaryCounters.get(group) ?? 0) + 1);
  }
  if (counters.size === 0 && secondaryCounters.size === 0) return "none";
  const counts = [...counters.values()].sort((a, b) => b - a);
  if (counts[0] >= 2) return "high";
  const hasSupportingMatch = [...counters.keys()].some((group) => (secondaryCounters.get(group) ?? 0) >= 1);
  if (weak.length >= 2 && hasSupportingMatch) return "medium";
  return "low";
}

export function buildSectionOrder(primaryThesis, analysisJson = {}) {
  if (primaryThesis?.category === "penalty") return [...PENALTY_SECTION_ORDER];
  let order;
  if (primaryThesis?.category === "running") order = [...RUNNING_SECTION_ORDER];
  else if (primaryThesis?.category === "roxzone") order = [...ROXZONE_SECTION_ORDER];
  else order = [...DEFAULT_SECTION_ORDER];

  const hasPenalty = totalPenaltySeconds(analysisJson) > 0;
  if (hasPenalty && !order.includes("penalty_callout")) {
    const snapIdx = order.indexOf("race_snapshot");
    order.splice(snapIdx >= 0 ? snapIdx + 1 : 2, 0, "penalty_callout");
  }
  return order;
}

export function buildHeroCopy(primaryThesis, analysisJson = {}) {
  const category = primaryThesis?.category ?? "station_capacity";
  const gain = headlineGainSeconds(analysisJson);
  const gainDisplay = Number.isFinite(gain) && gain > 0 ? formatGain(gain) : null;
  const lLabel = limiterLabel(analysisJson);
  if (category === "penalty") {
    return {
      headline: `${formatGain(totalPenaltySeconds(analysisJson))} OF PENALTIES IS YOUR FASTEST WIN`,
      subline: "Cleaner execution reclaims that time without a training block.",
      gainDisplay: null,
    };
  }
  if (category === "running") {
    return { headline: "YOUR RUNNING GAP IS BIGGER THAN YOUR STATION GAP", subline: "Closing that gap unlocks your finish time.", gainDisplay: null };
  }
  if (category === "roxzone") {
    return { headline: "TRANSITION LEAKAGE IS COSTING YOU FREE TIME", subline: "Roxzone efficiency is your lowest-effort gain.", gainDisplay: null };
  }
  if (category === "pacing") {
    return { headline: "YOU HAVE THE ENGINE - THE CEILING IS EXECUTION", subline: "Pacing discipline is the next unlock.", gainDisplay: null };
  }
  if (category === "data_quality") {
    return { headline: "YOUR ANALYSIS IS READY - HERE IS WHAT WE CAN SAY CONFIDENTLY", subline: null, gainDisplay: null };
  }
  return {
    headline: `${String(lLabel).toUpperCase()} IS YOUR BIGGEST OPPORTUNITY`,
    subline: gainDisplay ? "estimated opportunity against your target benchmark group." : null,
    gainDisplay,
  };
}

function secondaryEvidence(secondaryTheses = []) {
  const first = secondaryTheses[0];
  return first?.evidenceSummary ?? null;
}

export function buildSummaryBullets(primaryThesis, secondaryTheses = [], analysisJson = {}) {
  const category = primaryThesis?.category;
  const penalty = buildPenaltyInterpretation(analysisJson);
  const stationGap = totalStationGapSeconds(analysisJson);
  const runGap = totalRunGapSeconds(analysisJson);
  const runFade = finiteNumber(analysisJson.runningAnalysis?.runFadePct);
  const roxPct = finiteNumber(analysisJson.roxzoneAnalysis?.percentile);
  const bullets = [];

  if (category === "penalty") {
    const adjusted = penalty?.adjustedFinishTime ? ` Your adjusted time was ${penalty.adjustedFinishTime}.` : "";
    bullets.push(`${formatGain(penalty?.totalPenaltySeconds)} of penalties cost you an estimated ${formatGain(penalty?.totalPenaltySeconds)} of race time.${adjusted}`);
  } else if (category === "station_capacity") {
    const gain = headlineGainSeconds(analysisJson);
    const gainCopy = Number.isFinite(gain) && gain > 0 ? formatGain(gain) : formatGain(stationGap);
    bullets.push(`${limiterLabel(analysisJson)} is your biggest opportunity - ${gainCopy} against your target benchmark group.`);
  } else if (category === "running") {
    bullets.push(`Your cumulative run gap (${formatGain(runGap)}) exceeds your station gap (${formatGain(stationGap)}).`);
  } else if (category === "roxzone") {
    bullets.push(`Transition time put you in the ${formatPercentile(roxPct) ?? "lower range"} of your division.`);
  } else if (category === "pacing") {
    bullets.push(`Run fade of ${formatPercent(runFade)} suggests the engine is strong but pacing discipline left time on the table.`);
  } else if (category === "data_quality") {
    bullets.push("Benchmark data was limited for your division - targets shown are directional only.");
  }

  const second = secondaryEvidence(secondaryTheses);
  if (second) bullets.push(second);

  if (category === "penalty" || secondaryTheses.some((t) => t.category === "penalty")) {
    bullets.push("Priority action: eliminate penalties through station-specific technique work under fatigue.");
  } else if (category === "station_capacity") {
    bullets.push("Priority action: build station-specific strength endurance before adding more general volume.");
  } else if (category === "running" || category === "pacing") {
    bullets.push("Priority action: rehearse race-pace running under station fatigue.");
  } else if (category === "roxzone") {
    bullets.push("Priority action: rehearse faster station entry and exit without adding training load.");
  }

  return bullets.filter(Boolean).slice(0, 3);
}

function buildSuppressedSignals(primary, secondaryTheses, analysisJson = {}) {
  const suppressed = [];
  const runFade = finiteNumber(analysisJson.runningAnalysis?.runFadePct);
  const headlineGain = headlineGainSeconds(analysisJson);
  const categories = new Set([primary, ...secondaryTheses.map((t) => t.category)]);
  if (weakStationCount(analysisJson) === 0) {
    suppressed.push({ signalId: "background_station_capacity", reason: "not_actionable" });
  }
  if ((runFade == null || runFade < 8) || (!categories.has("running") && !categories.has("pacing"))) {
    suppressed.push({ signalId: "exec_summary_run_fade", reason: "duplicate" });
  }
  if (headlineGain == null || headlineGain <= 0) {
    suppressed.push({ signalId: "hero_gain_display", reason: "not_actionable" });
  }
  return suppressed;
}

export function buildInterpretation(analysisJson = {}, athleteContext = {}) {
  void athleteContext;
  const primaryCategory = selectPrimaryCategory(analysisJson);
  const primaryThesis = thesis(primaryCategory, analysisJson);
  const secondaryTheses = buildSecondaryTheses(primaryCategory, analysisJson);
  const penaltyInterpretation = buildPenaltyInterpretation(analysisJson);
  return {
    primaryThesis,
    secondaryTheses,
    protectedStrengths: protectedStrengths(analysisJson),
    suppressedSignals: buildSuppressedSignals(primaryCategory, secondaryTheses, analysisJson),
    sectionOrder: buildSectionOrder(primaryThesis, analysisJson),
    heroCopy: buildHeroCopy(primaryThesis, analysisJson),
    summaryBullets: buildSummaryBullets(primaryThesis, secondaryTheses, analysisJson),
    penaltyInterpretation,
    runPattern: analysisJson.runningAnalysis?.runPattern ?? null,
    muscleGroupConfidence: muscleGroupConfidence(analysisJson),
  };
}
