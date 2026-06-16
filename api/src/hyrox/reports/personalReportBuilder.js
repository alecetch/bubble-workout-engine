import { formatGain, formatPercent, formatPercentile, formatTime, label } from "./copyFormatter.js";
import { buildRecommendations } from "./recommendationBuilder.js";
import { buildBackgroundSection } from "./backgroundPersonaliser.js";
import { buildTrainingVolumeAdvice } from "./trainingVolumeAdvisor.js";
import { buildRoxzoneSection } from "./roxzoneCommentary.js";

function hasContext(athleteContext) {
  return athleteContext && Object.keys(athleteContext).length > 0;
}

function section(sectionKey, title, content) {
  return { sectionKey, title, content };
}

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function contextCopy(analysisJson, athleteContext = {}) {
  const limiterKey = analysisJson.headline?.biggestLimiter?.segmentKey;
  if ((athleteContext.fiveKPbSeconds || athleteContext.engineScore >= 65) && limiterKey === "wall_balls") {
    return "Your engine is likely not the issue. The gap appears when running has to convert into station output under fatigue.";
  }
  if (athleteContext.strengthBenchmarks || athleteContext.deadliftKg || athleteContext.squatKg) {
    return "Your loaded stations may be supported by your strength background, but your race ceiling is likely limited by aerobic durability.";
  }
  if (Number(athleteContext.weeklyKm) < 20 && analysisJson.scores?.engineScore < 55) {
    return "A gradual increase in running frequency is likely to improve your ceiling, provided recovery is managed.";
  }
  if (Number(athleteContext.weeklyKm) >= 40 && analysisJson.runningAnalysis?.runFadePct >= 8) {
    return "More volume may not be the main answer; your result points toward durability and pacing under station fatigue.";
  }
  return null;
}

function stationBreakdownSection(analysisJson) {
  const breakdown = analysisJson.stationBreakdown ?? [];
  const highConfidence = breakdown.filter((station) => station.confidence !== "low");
  const candidates = highConfidence.length > 0 ? highConfidence : breakdown;
  const weak = candidates.filter((station) => station.timeGapSeconds > 0).slice(0, 3);
  const strong = [...candidates].reverse().find((station) => station.timeGapSeconds < 0);

  if (weak.length === 0) {
    const limiter = analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
    return limiter
      ? `${limiter.label} is the main limiter, with an estimated gain of ${formatGain(analysisJson.timePotential?.headlineGainSeconds ?? limiter.timeGapSeconds)}.`
      : "No single station limiter dominated this result.";
  }

  const lines = ["Your weakest stations against your benchmark group:"];
  weak.forEach((station, index) => {
    const sign = station.timeGapSeconds > 0 ? "+" : "";
    lines.push(`${index + 1}. ${station.label} - ${formatPercentile(station.percentile) ?? "unranked"} (${sign}${formatGain(station.timeGapSeconds)} vs. target)`);
  });
  if (strong) {
    lines.push(`Your strongest station: ${strong.label} - ${formatPercentile(strong.percentile) ?? "top percentile"}.`);
  }
  return lines;
}

function penaltyNote(analysisJson) {
  const penalties = analysisJson.penalties ?? [];
  if (penalties.length === 0) return null;
  const totalPenaltySeconds = penalties.reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  const finishSeconds = analysisJson.race?.finishTimeSeconds ?? null;
  const adjustedSeconds = Number.isFinite(finishSeconds) ? finishSeconds - totalPenaltySeconds : null;
  const adjustedLabel = Number.isFinite(adjustedSeconds) && adjustedSeconds >= 0
    ? ` Adjusted time without penalt${penalties.length > 1 ? "ies" : "y"}: ${formatTime(adjustedSeconds)}.`
    : "";
  const penaltyList = penalties
    .map((penalty) => `${label(penalty.station)} (+${formatGain(penalty.penaltySeconds)})`)
    .join(", ");
  return `${penalties.length} penalt${penalties.length > 1 ? "ies" : "y"} recorded: ${penaltyList}.${adjustedLabel} This analysis is based on your actual recorded time.`;
}

function buildSplitTableText(analysisJson, athleteContext = {}) {
  const RACE_ORDER = [
    "run_1", "ski_erg", "run_2", "sled_push", "run_3", "sled_pull",
    "run_4", "burpee_broad_jump", "run_5", "row", "run_6", "farmers_carry",
    "run_7", "sandbag_lunges", "run_8", "wall_balls",
  ];
  const AGGREGATES = ["run_time", "work_time", "roxzone_time", "total_time"];
  const segMap = new Map((analysisJson.segments ?? []).map((row) => [row.segmentKey, row]));
  const goalGroup = analysisJson.benchmarkContext?.goalBenchmarkGroup ?? null;

  function targetSecondsFor(seg) {
    if (Number.isFinite(seg?.exactTargetSeconds)) return seg.exactTargetSeconds;
    if (goalGroup && Number.isFinite(seg?.goalBenchmarkSeconds)) return seg.goalBenchmarkSeconds;
    return seg?.benchmarkMedianSeconds ?? null;
  }

  function gapSecs(seg) {
    if (Number.isFinite(seg?.timeGapToExactTargetSeconds)) return seg.timeGapToExactTargetSeconds;
    return Number.isFinite(seg?.timeGapToMedianSeconds) ? seg.timeGapToMedianSeconds : null;
  }

  function rowText(seg, marker = "") {
    const userT = Number.isFinite(seg.userSeconds) ? formatTime(seg.userSeconds) : "–";
    const targetSecs = targetSecondsFor(seg);
    const targetT = Number.isFinite(targetSecs) ? formatTime(targetSecs) : "–";
    const gap = gapSecs(seg);
    const gapStr = !Number.isFinite(gap)
      ? "–"
      : gap === 0
        ? "0:00"
        : `${gap > 0 ? "+" : "−"}${formatGain(Math.abs(gap))}`;
    return `${seg.label}: ${userT}  target ${targetT}  ${gapStr}${marker}`;
  }

  const gaps = RACE_ORDER
    .map((key) => ({ key, gap: gapSecs(segMap.get(key)) }))
    .filter((row) => Number.isFinite(row.gap) && row.gap > 0)
    .sort((a, b) => b.gap - a.gap);
  const top1 = gaps[0]?.key;
  const top2 = gaps[1]?.key;
  const top3 = gaps[2]?.key;

  const lines = [];
  for (const key of RACE_ORDER) {
    const seg = segMap.get(key);
    if (!seg) continue;
    const marker = (key === top1 || key === top2) ? " **" : key === top3 ? " *" : "";
    lines.push(rowText(seg, marker));
  }

  const totalPenalty = (analysisJson.penalties ?? []).reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  for (const key of AGGREGATES) {
    const seg = segMap.get(key);
    if (seg) lines.push(rowText(seg));
    if (key === "work_time" && totalPenalty > 0) {
      lines.push(`Penalties: ${formatTime(totalPenalty)}  target 0:00  +${formatGain(totalPenalty)}`);
    }
  }

  const benchmarkLabel = goalGroup?.label ?? analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? "your benchmark group";
  lines.push(`* Target: ${benchmarkLabel}. (+) = slower than target; (−) = faster.`);
  if (gaps.length > 0) lines.push("** = biggest opportunity");
  return lines;
}

export function buildPersonalReport(analysisJson = {}, insights = [], athleteContext = {}) {
  const limiter = analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
  const strength = analysisJson.headline?.biggestStrength ?? analysisJson.strengths?.[0] ?? null;
  const total = segment(analysisJson, "total_time");
  const recommendations = buildRecommendations(analysisJson, insights, athleteContext);
  const gainSeconds = analysisJson.timePotential?.headlineGainSeconds ?? limiter?.timeGapSeconds ?? 0;
  const ctxCopy = hasContext(athleteContext) ? contextCopy(analysisJson, athleteContext) : null;
  const sections = [];
  const summary = [];

  if (limiter) summary.push(`${limiter.label} is the biggest estimated opportunity, with ${formatGain(gainSeconds)} potential gain.`);
  if (analysisJson.runningAnalysis?.runFadePct >= 8) summary.push(`Run fade was ${formatPercent(analysisJson.runningAnalysis.runFadePct)}, so fatigue resistance and pacing deserve attention.`);
  if (ctxCopy) summary.push(ctxCopy);
  sections.push(section("executive_summary", "Executive Summary", summary.slice(0, 3)));

  const snapshot = [
    `Finish time: ${formatTime(analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds) ?? "not supplied"}.`,
    `Division: ${athleteContext.division ?? analysisJson.race?.division ?? analysisJson.athlete?.division ?? "not supplied"}.`,
    `Overall benchmark: ${formatPercentile(total?.percentile) ?? "not available"} against ${analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? "your benchmark group"}.`,
  ];
  const pNote = penaltyNote(analysisJson);
  if (pNote) snapshot.push(pNote);
  sections.push(section("race_snapshot", "Race Snapshot", snapshot));

  sections.push(section("biggest_strength", "Biggest Strength", strength ? `${strength.label} is the strongest benchmarked area at ${formatPercentile(strength.percentile) ?? "a strong percentile"}.` : "No single high-confidence strength dominated this result."));
  sections.push(section("biggest_limiter", "Station Breakdown", stationBreakdownSection(analysisJson)));
  const splitSegments = (analysisJson.segments ?? []).filter(
    (row) => (row.type === "run" || row.type === "station") && Number.isFinite(row.userSeconds),
  );
  if (splitSegments.length >= 8) {
    sections.push({
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      content: buildSplitTableText(analysisJson, athleteContext),
      tableData: {
        segments: analysisJson.segments ?? [],
        penalties: analysisJson.penalties ?? [],
        benchmarkContext: analysisJson.benchmarkContext ?? {},
        targetFinishTimeSeconds: athleteContext.targetFinishTimeSeconds ?? athleteContext.targetTimeSeconds ?? analysisJson.race?.targetTimeSeconds ?? null,
      },
    });
  }
  const headlineGain = analysisJson.timePotential?.headlineGainSeconds ?? 0;
  const limiterGap = limiter?.timeGapSeconds ?? 0;
  const clarification = Math.abs(headlineGain - limiterGap) > 30
    ? ` (${formatGain(limiterGap)} to benchmark median; ${formatGain(headlineGain)} to your target finish time)`
    : "";
  sections.push(section("time_potential", "Time Potential", `Estimated opportunity: ${formatGain(headlineGain)} potential gain.${clarification} This is an estimate, not a guarantee.`));
  sections.push(section("running_fatigue", "Running and Fatigue Profile", analysisJson.runningAnalysis?.available ? `Run fade was ${formatPercent(analysisJson.runningAnalysis.runFadePct)}.` : "Run fade could not be calculated from the supplied splits."));
  const volumeAdvice = buildTrainingVolumeAdvice(analysisJson, athleteContext);
  if (volumeAdvice) {
    const content = [];
    if (volumeAdvice.runningAdvice?.copy) content.push(volumeAdvice.runningAdvice.copy);
    if (volumeAdvice.strengthAdvice?.copy) content.push(volumeAdvice.strengthAdvice.copy);
    if (content.length > 0) {
      sections.push(section("training_volume", "Training Volume Assessment", content));
    }
  }
  const backgroundCopy = buildBackgroundSection(analysisJson, athleteContext);
  if (backgroundCopy) {
    sections.push(section("athlete_background", "Your Background in Context", backgroundCopy));
  }
  sections.push(section("roxzone_execution", "Roxzone and Execution Profile", buildRoxzoneSection(analysisJson)));

  if (ctxCopy) {
    sections.push(section("training_context", "Training Context Interpretation", ctxCopy));
  }

  const horizonLabel = recommendations[0]?.timeHorizon ?? null;
  const recItems = recommendations.map((item) => `${item.priority}. ${item.title}: ${item.rationale}${item.safetyNote ? ` ${item.safetyNote}` : ""}`);
  const recContent = horizonLabel ? [`Training focus - ${horizonLabel}:`, ...recItems] : recItems;
  sections.push({
    sectionKey: "recommended_focus_areas",
    title: "Recommended Focus Areas",
    content: recContent,
    richRecommendations: recommendations,
  });
  sections.push(section("cta", "Next Step", "Use Forma to build a training plan targeting your bottleneck."));

  return { sections, recommendations };
}
