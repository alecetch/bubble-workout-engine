import { bandScoreLabel, formatGain, formatPercent, formatTime, label } from "./copyFormatter.js";
import { buildRecommendations, buildGapBreakdown, formatGapBreakdown } from "./recommendationBuilder.js";
import { buildBackgroundSection } from "./backgroundPersonaliser.js";
import { buildTrainingVolumeAdvice } from "./trainingVolumeAdvisor.js";
import { buildStrengthSignalCopy } from "./strengthSignalAdvisor.js";
import { resolveReportStrength } from "./reportSelections.js";
import { buildRoxzoneSection } from "./roxzoneCommentary.js";
import { renderMuscleDiagramPair } from "../engine/muscleDiagramRenderer.js";
import { getSegmentLabel } from "../engine/segmentNormaliser.js";

function hasContext(athleteContext) {
  return athleteContext && Object.keys(athleteContext).length > 0;
}

function section(sectionKey, title, content) {
  return { sectionKey, title, content };
}

const WARNING_LABELS = Object.freeze({
  roxzone_inferred_from_unallocated_time: "Transition (RoxZone) time was estimated from unallocated race time, not recorded directly.",
  partial_split_data: "Some race splits are missing and were excluded from split-level analysis.",
  incomplete_running_splits: "HYROX did not publish complete running splits for this result, so running pace cannot be analysed reliably.",
  missing_run_total: "HYROX did not publish an official Run Total for this result.",
});

const SECTION_KEY_MAP = Object.freeze({
  station_breakdown: "biggest_limiter",
  split_table: "race_split_breakdown",
  muscle_group: "muscle_group_profile",
  background_context: "athlete_background",
  recommendations: "recommended_focus_areas",
});

function actualSectionKey(sectionKey) {
  return SECTION_KEY_MAP[sectionKey] ?? sectionKey;
}

function orderSections(sections, interpretation) {
  const placeAfter = (items, anchorKey, moveKeys) => {
    const result = items.filter((item) => !moveKeys.includes(item.sectionKey));
    const moving = moveKeys
      .map((key) => items.find((item) => item.sectionKey === key))
      .filter(Boolean);
    const anchorIndex = result.findIndex((item) => item.sectionKey === anchorKey);
    if (anchorIndex < 0 || moving.length === 0) return result;
    result.splice(anchorIndex + 1, 0, ...moving);
    return result;
  };

  if (!interpretation?.sectionOrder) {
    return placeAfter(sections, "race_split_breakdown", ["recommended_focus_areas", "training_volume", "muscle_group_profile"]);
  }
  const remaining = [...sections];
  const ordered = [];
  for (const requestedKey of interpretation.sectionOrder) {
    const key = actualSectionKey(requestedKey);
    const index = remaining.findIndex((candidate) => candidate.sectionKey === key);
    if (index >= 0) ordered.push(...remaining.splice(index, 1));
  }
  const ctaIndex = remaining.findIndex((candidate) => candidate.sectionKey === "cta");
  const cta = ctaIndex >= 0 ? remaining.splice(ctaIndex, 1) : [];
  return placeAfter([...ordered, ...remaining, ...cta], "race_split_breakdown", ["recommended_focus_areas", "training_volume", "muscle_group_profile"]);
}

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function segmentGapSeconds(row) {
  if (Number.isFinite(row?.frameGapSeconds)) return row.frameGapSeconds;
  if (Number.isFinite(row?.timeGapToExactTargetSeconds)) return row.timeGapToExactTargetSeconds;
  if (Number.isFinite(row?.timeGapToMedianSeconds)) return row.timeGapToMedianSeconds;
  if (Number.isFinite(row?.timeGapSeconds)) return row.timeGapSeconds;
  if (Number.isFinite(row?.timeAdvantageSeconds)) return -Math.abs(row.timeAdvantageSeconds);
  return null;
}

function segmentComparisonSeconds(row) {
  if (Number.isFinite(row?.exactTargetSeconds)) return row.exactTargetSeconds;
  if (Number.isFinite(row?.goalBenchmarkSeconds)) return row.goalBenchmarkSeconds;
  if (Number.isFinite(row?.benchmarkMedianSeconds)) return row.benchmarkMedianSeconds;
  if (Number.isFinite(row?.userSeconds) && Number.isFinite(segmentGapSeconds(row))) {
    return row.userSeconds - segmentGapSeconds(row);
  }
  return null;
}

function splitStatusLabel(row) {
  return bandScoreLabel(segmentGapSeconds(row), segmentComparisonSeconds(row));
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
  if (Number(athleteContext.weeklyKm) >= 40 && hasMaterialRunFade(analysisJson.runningAnalysis)) {
    return "More volume may not be the main answer; your result points toward durability and pacing under station fatigue.";
  }
  return null;
}

function hasMaterialRunFade(runningAnalysis = {}) {
  return runningAnalysis.interpretation === "materially_above_benchmark"
    || runningAnalysis.interpretation === "late_fade_present";
}

function stationBreakdownSection(analysisJson) {
  const breakdown = analysisJson.stationBreakdown ?? [];
  const highConfidence = breakdown.filter((station) => station.confidence !== "low");
  const candidates = highConfidence.length > 0 ? highConfidence : breakdown;
  const weak = candidates.filter((station) => station.timeGapSeconds > 0).slice(0, 3);
  const strong = [...candidates].reverse().find((station) => station.timeGapSeconds < 0);
  const isTargetMode = Boolean(analysisJson.benchmarkContext?.goalBenchmarkGroup);

  if (weak.length === 0) {
    const limiter = analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
    return limiter
      ? `${limiter.label} is the main limiter, with an estimated gain of ${formatGain(analysisJson.timePotential?.headlineGainSeconds ?? limiter.timeGapSeconds)}.`
      : "No single station limiter dominated this result.";
  }

  if (isTargetMode) {
    const lines = ["Your biggest station gaps against your target profile:"];
    weak.forEach((station, index) => {
      lines.push(`${index + 1}. ${station.label} - Target opportunity (+${formatGain(station.timeGapSeconds)} vs target profile)`);
    });
    if (strong) {
      lines.push(`Protect this strength: ${strong.label} — ahead of target profile.`);
    }
    return lines;
  }

  const lines = ["Your weakest stations against your benchmark band:"];
  weak.forEach((station, index) => {
    const bsLabel = splitStatusLabel(station);
    const bsCopy = bsLabel ? `${bsLabel} vs your benchmark band` : "on benchmark";
    lines.push(`${index + 1}. ${station.label} - ${bsCopy} (+${formatGain(station.timeGapSeconds)} vs benchmark)`);
  });
  if (strong) {
    const strongBs = splitStatusLabel(strong);
    const strongCopy = strongBs ? `${strongBs} vs your benchmark band` : "Strength vs your benchmark band";
    const stationIntro = (strongBs === "Strength" || !strongBs) ? "Your strongest station" : "Your best relative station";
    lines.push(`${stationIntro}: ${strong.label} - ${strongCopy}.`);
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
    .map((penalty) => {
      const runNum = String(penalty.runKey ?? penalty.station ?? "").match(/\d+/)?.[0];
      const runLabel = runNum ? `Run ${runNum}` : label(penalty.runKey ?? penalty.station ?? "");
      return `${runLabel} (+${formatGain(penalty.penaltySeconds)})`;
    })
    .join(", ");
  return `${penalties.length} penalt${penalties.length > 1 ? "ies" : "y"} recorded: ${penaltyList}.${adjustedLabel} This analysis is based on your actual recorded time.`;
}

function penaltyCalloutSection(analysisJson = {}, interpretation = null) {
  const penalties = analysisJson.penalties ?? [];
  const total = penalties.reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  if (total <= 0) return null;
  const adjustedTime = interpretation?.penaltyInterpretation?.adjustedFinishTime;
  const content = [
    `${formatGain(total)} in penalties recorded.${adjustedTime ? ` Your adjusted race time was ${adjustedTime}.` : ""}`,
  ];
  const affectedSegments = penalties
    .map((penalty) => {
      const key = String(penalty.runKey ?? penalty.station ?? penalty.segmentKey ?? "");
      const runNum = key.match(/^run_(\d+)$/)?.[1];
      if (runNum) return `Run ${runNum}`;
      return label(key) || null;
    })
    .filter(Boolean);
  if (affectedSegments.length > 0) {
    content.push(`The penalty was recorded at ${affectedSegments.join(", ")}.`);
  }
  content.push("Before chasing fitness gains, reclaim this time through cleaner station execution.");
  return section("penalty_callout", "Penalty Analysis", content);
}

function runNumber(runKey) {
  const match = String(runKey ?? "").match(/^run_(\d)$/);
  return match ? Number(match[1]) : null;
}

function pacingNarrative(runPattern) {
  if (runPattern === "strong_finish") return "You finished the run sequence strongly, which points to controlled pacing and useful late-race reserve.";
  if (runPattern === "negative_split") return "Your later runs were faster than your early runs, suggesting disciplined pacing rather than a durability collapse.";
  if (runPattern === "even") return "Your run pacing was relatively even, so the bigger opportunity is likely station execution or transition efficiency.";
  if (runPattern === "positive_split") return "Your run profile faded through the race, which usually points to pacing discipline, station fatigue, or both.";
  return null;
}

function runningFatigueContent(analysisJson) {
  const running = analysisJson.runningAnalysis ?? {};
  const content = [];
  const affectedRuns = running.penaltyAffectedRuns ?? [];
  if (affectedRuns.length > 0) {
    for (const penalty of affectedRuns) {
      const number = runNumber(penalty.runKey);
      const labelText = number ? `Run ${number}` : label(penalty.runKey);
      content.push(`${labelText} included a ${formatTime(penalty.penaltySeconds)} penalty. Your penalty-corrected split was ${formatTime(penalty.adjustedSeconds)}, so pacing analysis separates race execution from raw recorded time.`);
    }
  }
  content.push(
    running.available
      ? `Run fade was ${formatPercent(running.runFadePct)}.`
      : "Run fade could not be calculated from the supplied splits.",
  );
  const narrative = pacingNarrative(running.runPattern);
  if (narrative) content.push(narrative);
  return content;
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
    if (Number.isFinite(seg?.nextBandMedianSeconds)) return seg.nextBandMedianSeconds;
    if (Number.isFinite(seg?.exactTargetSeconds)) return seg.exactTargetSeconds;
    if (goalGroup && Number.isFinite(seg?.goalBenchmarkSeconds)) return seg.goalBenchmarkSeconds;
    return seg?.benchmarkMedianSeconds ?? null;
  }

  function gapSecs(seg) {
    if (Number.isFinite(seg?.frameGapSeconds)) return seg.frameGapSeconds;
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

  const benchmarkLabel = goalGroup?.label ?? analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? "your benchmark band";
  lines.push(`* Target: ${benchmarkLabel}. (+) = slower than target; (−) = faster.`);
  if (gaps.length > 0) lines.push("** = biggest opportunity");
  return lines;
}

export function buildMuscleGroupSection(muscleGroupProfile, sex = "male") {
  const { conclusion = {}, stationClassifications = [] } = muscleGroupProfile;
  const content = [];
  if (conclusion.headline) content.push(`${conclusion.headline}.`);
  if (conclusion.body) content.push(conclusion.body);
  if (conclusion.trainingHint) content.push(`Training focus: ${conclusion.trainingHint}`);
  const diagramPair = renderMuscleDiagramPair(muscleGroupProfile, sex);
  if (diagramPair) {
    content.push({ __type: "muscle_diagram_pair", frontSvg: diagramPair.frontSvg, backSvg: diagramPair.backSvg });
  }
  const weakStations = stationClassifications.filter((s) => s.relativeClass === "weak");
  const strongStations = stationClassifications.filter((s) => s.relativeClass === "strong");
  const pct = (s) => {
    const bs = splitStatusLabel(s);
    return bs ? `${bs} vs benchmark band` : "on benchmark";
  };
  if (weakStations.length > 0) {
    content.push(`Weakest stations: ${weakStations.map((s) => `${s.label} (${pct(s)})`).join(", ")}`);
  }
  if (strongStations.length > 0) {
    const isRelative = strongStations.every((s) => (s.timeGapSeconds ?? 0) > -30);
    const prefix = isRelative ? "Relative strengths" : "Strongest stations";
    content.push(`${prefix}: ${strongStations.map((s) => `${s.label} (${pct(s)})`).join(", ")}`);
  }
  return content;
}

function shouldIncludeRunFadeInSummary(analysisJson, interpretation) {
  if (!hasMaterialRunFade(analysisJson.runningAnalysis)) return false;
  if (!interpretation) return true;
  const categories = new Set([
    interpretation.primaryThesis?.category,
    ...(interpretation.secondaryTheses ?? []).map((thesis) => thesis.category),
  ]);
  return categories.has("running") || categories.has("pacing");
}

function stationBreakdownTitle(calculatorMode = "target", primaryCategory = null, analysisFrame = null) {
  if (primaryCategory === "high_performer") return "Relative Profile Observations";
  const frame = analysisFrame?.frame;
  const compBand = analysisFrame?.comparisonBand?.replace("sub_", "sub-") ?? null;
  if (frame === "next_band" || frame === "next_band_stretch") {
    return compBand ? `Top Opportunities to Reach ${compBand}` : "Next Band Opportunities";
  }
  if (calculatorMode === "analyse") return "Race Profile Gaps";
  return "Station Breakdown";
}

function isPartialAnalysis(analysisJson = {}) {
  return analysisJson.analysisScope === "partial"
    || (analysisJson.dataQuality?.inputCompleteness ?? 1) < 0.85;
}

function joinLabels(labels = []) {
  if (labels.length <= 1) return labels[0] ?? "split";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function warningLabel(code, analysisJson = {}) {
  if (code !== "split_estimated_from_residual") return WARNING_LABELS[code];
  const labels = (analysisJson.dataQuality?.estimatedSplitKeys ?? []).map(getSegmentLabel).filter(Boolean);
  const joined = joinLabels(labels);
  const plural = labels.length > 1;
  return `The ${joined} split${plural ? "s were" : " was"} missing from official results. Forma estimated ${plural ? "them" : "it"} from your total race time so station and transition totals still reconcile - treat the ${joined} figure${plural ? "s" : ""} as directional.`;
}

function dataConfidenceSection(analysisJson = {}) {
  const warnings = (analysisJson.dataQuality?.warnings ?? [])
    .map((code) => warningLabel(code, analysisJson))
    .filter(Boolean);
  const hasIncompleteRuns = (analysisJson.dataQuality?.warnings ?? []).some((code) => code === "incomplete_running_splits" || code === "missing_run_total");
  return section("data_confidence", "What We Can and Cannot Infer", [
    "This analysis is based on partial split data. Conclusions about individual splits are directional.",
    ...warnings,
    hasIncompleteRuns
      ? "Overall performance, station execution and total race analysis are still shown. Running pattern and run-total comparisons are unavailable."
      : "Overall performance percentile and running pattern are available. Specific muscle-group conclusions are limited.",
  ]);
}

function ctaCopy(calculatorMode = "target", primaryCategory = null) {
  if (primaryCategory === "high_performer") {
    return "Use Forma to build a training plan that preserves your strengths and finds marginal gains.";
  }
  if (calculatorMode === "analyse" && primaryCategory === "data_quality") {
    return "Use Forma to build a plan once your full split data is available.";
  }
  if (calculatorMode === "analyse") {
    return "Use Forma to build a plan targeting your race-profile opportunities.";
  }
  return "Use Forma to build a training plan targeting your bottleneck.";
}

export function buildPersonalReport(analysisJson = {}, insights = [], athleteContext = {}, interpretation = null, calculatorMode = "target", contract = null) {
  const limiter = analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
  const strength = resolveReportStrength(analysisJson);
  const total = segment(analysisJson, "total_time");
  const recommendations = buildRecommendations(
    analysisJson,
    insights,
    athleteContext,
    calculatorMode,
    analysisJson.benchmarkContext?.analysisFrame,
  );
  const gainSeconds = analysisJson.timePotential?.headlineGainSeconds ?? limiter?.timeGapSeconds ?? 0;
  const ctxCopy = hasContext(athleteContext) ? contextCopy(analysisJson, athleteContext) : null;
  const muscleGroupProfile = analysisJson.muscleGroupProfile ?? null;
  const primaryCategory = interpretation?.primaryThesis?.category ?? null;
  const isPartial = isPartialAnalysis(analysisJson);
  const sections = [];
  const summary = [];

  if (interpretation?.summaryBullets?.length) {
    summary.push(...interpretation.summaryBullets);
  } else {
    if (limiter) summary.push(`${limiter.label} is the biggest estimated opportunity, with ${formatGain(gainSeconds)} potential gain.`);
    if (shouldIncludeRunFadeInSummary(analysisJson, interpretation)) summary.push(`Run fade was ${formatPercent(analysisJson.runningAnalysis.runFadePct)}, so fatigue resistance and pacing deserve attention.`);
    if (ctxCopy) summary.push(ctxCopy);
  }
  sections.push(section("executive_summary", "Executive Summary", summary.slice(0, 3)));
  if (isPartial) {
    sections.push(dataConfidenceSection(analysisJson));
  }

  const totalBs = splitStatusLabel(total);
  const snapshot = [
    `Finish time: ${formatTime(analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds) ?? "not supplied"}.`,
    `Division: ${athleteContext.division ?? analysisJson.race?.division ?? analysisJson.athlete?.division ?? "not supplied"}.`,
    `Overall benchmark: ${totalBs ? `${totalBs} vs benchmark band` : "on benchmark"} against ${analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? "your benchmark band"}.`,
  ];
  const pNote = penaltyNote(analysisJson);
  if (pNote) snapshot.push(pNote);
  sections.push(section("race_snapshot", "Race Snapshot", snapshot));
  const penaltySection = penaltyCalloutSection(analysisJson, interpretation);
  if (penaltySection) sections.push(penaltySection);

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
  const horizonLabel = recommendations[0]?.timeHorizon ?? null;
  const recItems = recommendations.map((item) => `${item.priority}. ${item.title}: ${item.rationale}${item.safetyNote ? ` ${item.safetyNote}` : ""}`);
  const gapItems = buildGapBreakdown(analysisJson);
  const recContent = horizonLabel ? [`Training focus - ${horizonLabel}:`, ...recItems] : [...recItems];
  if (gapItems.length >= 2) recContent.push(formatGapBreakdown(gapItems));
  sections.push({
    sectionKey: "recommended_focus_areas",
    title: "Recommended Focus Areas",
    content: recContent,
    richRecommendations: recommendations,
  });
  const volumeAdvice = buildTrainingVolumeAdvice(analysisJson, athleteContext);
  const strengthCheckCopy = buildStrengthSignalCopy(analysisJson, athleteContext, calculatorMode);
  const volumeContent = [];
  const volumeLabels = [];
  if (volumeAdvice?.runningAdvice?.copy) {
    volumeContent.push(volumeAdvice.runningAdvice.copy);
    volumeLabels.push("Running volume");
  }
  if (volumeAdvice?.strengthAdvice?.copy) {
    volumeContent.push(volumeAdvice.strengthAdvice.copy);
    volumeLabels.push("Strength frequency");
  }
  if (strengthCheckCopy) {
    volumeContent.push(strengthCheckCopy);
    volumeLabels.push("Strength check");
  }
  if (volumeContent.length > 0) {
    sections.push({ sectionKey: "training_volume", title: "Training Volume Assessment", content: volumeContent, contentLabels: volumeLabels });
  }
  if (muscleGroupProfile?.available && muscleGroupProfile?.patternFound && !(isPartial && interpretation?.muscleGroupConfidence === "low")) {
    const sex = analysisJson.athlete?.sex ?? "male";
    sections.push(section("muscle_group_profile", "Muscle Group Profile", buildMuscleGroupSection(muscleGroupProfile, sex)));
  }
  sections.push(section("running_fatigue", "Running and Fatigue Profile", runningFatigueContent(analysisJson)));
  const strengthBs = splitStatusLabel(strength);
  sections.push(section("biggest_strength", "Biggest Strength", strength ? `${strength.label} is the strongest benchmarked area${strengthBs ? ` - ${strengthBs} vs your benchmark band` : ""}.` : "No single high-confidence strength dominated this result."));
  sections.push(section(
    "biggest_limiter",
    stationBreakdownTitle(calculatorMode, primaryCategory, analysisJson.benchmarkContext?.analysisFrame),
    stationBreakdownSection(analysisJson),
  ));
  const headlineGain = analysisJson.timePotential?.headlineGainSeconds ?? 0;
  const limiterGap = limiter?.timeGapSeconds ?? 0;
  const clarification = Math.abs(headlineGain - limiterGap) > 30
    ? ` (${formatGain(limiterGap)} to benchmark median; ${formatGain(headlineGain)} to your target finish time)`
    : "";
  sections.push(section("time_potential", "Time Potential", `Estimated opportunity: ${formatGain(headlineGain)} potential gain.${clarification} This is an estimate, not a guarantee.`));
  const backgroundResult = buildBackgroundSection(analysisJson, athleteContext, contract);
  if (backgroundResult) {
    sections.push(section("athlete_background", "Your Background in Context", backgroundResult.copy));
  }
  sections.push(section("roxzone_execution", "RoxZone and Execution Profile", buildRoxzoneSection(analysisJson, { calculatorMode })));

  if (ctxCopy) {
    sections.push(section("training_context", "Training Context Interpretation", ctxCopy));
  }

  sections.push(section("cta", "Next Step", ctaCopy(calculatorMode, primaryCategory)));

  return {
    sections: orderSections(sections, interpretation),
    recommendations,
    backgroundClaimedCategory: backgroundResult?.category ?? null,
  };
}
