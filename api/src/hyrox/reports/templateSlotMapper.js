import { SEGMENT_MAP, STATION_KEYS } from "../config/segmentMap.js";
import { getBenchmarkStats } from "../engine/benchmarkService.js";
import { hasBenchmarkPercentileData } from "./comparisonOptions.js";
import { hasGoalGroup } from "./comparisonBasis.js";
import { comparisonProfileLabel } from "./comparisonProfileLabel.js";
import { ageGroupContextLine, formatGain, formatPercent, formatSocialGapParts, formatSocialMagnitudeParts, formatTime, formatTimeDiff, label, regionalContextLine } from "./copyFormatter.js";
import { resolveHeroImage } from "./heroImageResolver.js";
import { ensureHyroxReportContract } from "./reportContractBuilder.js";
import { dataQualityNote, reportStrengthGapSeconds, resolveReportStrength } from "./reportSelections.js";
import { roxzoneActionability } from "./roxzoneActionability.js";
import { displaySegmentLabel } from "./segmentDisplay.js";
import { buildSplitDisplayRows } from "./splitRowDisplayContract.js";

const RACE_SEGMENTS = SEGMENT_MAP.filter((segment) => segment.type !== "roxzone");
const DEFAULT_FEATURES = Object.freeze(["Biggest Limiter", "Time Potential", "Relative Split Signal", "Percentile Ranking", "Race Efficiency Score"]);
const DEFAULT_NO_PERCENTILE_FEATURES = Object.freeze(DEFAULT_FEATURES.filter((feature) => feature !== "Percentile Ranking"));

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function stationSegments(analysisJson) {
  return (analysisJson.segments ?? []).filter((row) => row.type === "station" || STATION_KEYS.includes(row.segmentKey));
}

function bestStation(analysisJson) {
  return resolveReportStrength(analysisJson);
}

function opportunityStation(analysisJson) {
  // Prefer the engine's frame-adjusted limiter — same source the email uses.
  if (analysisJson.headline?.biggestLimiter?.segmentKey) return analysisJson.headline.biggestLimiter;
  if (analysisJson.limiters?.[0]?.segmentKey) return analysisJson.limiters[0];
  return [...stationSegments(analysisJson)]
    .filter((row) => Number(row.timeGapToMedianSeconds) > 0)
    .sort((a, b) => b.timeGapToMedianSeconds - a.timeGapToMedianSeconds)[0]
    ?? null;
}

function upper(value) {
  return String(value ?? "").toUpperCase();
}

function strengthPresentationLabel(status) {
  if (status === "reliable_strength") return "BIGGEST STRENGTH";
  if (status === "fastest_ahead_split_only") return "BEST RELATIVE SPLIT";
  if (status === "suppressed") return "SPLIT CONFIDENCE";
  return "NO CLEAR STRENGTH";
}

// Parses an already-formatted signed time string ("-0:33", "+1:02:15", "0:00") back to seconds.
// Needed because strengthPolicy's "fastest_ahead_split_only" fallback (used whenever there's no
// fully "reliable" strength, e.g. Marcus Fernandes' case below) only carries a pre-formatted
// displayGap string, not raw seconds — strengthGapSeconds() doesn't reliably resolve a number for
// that shape, so the social phrase must be able to derive its value from the string form too.
function parseSignedTimeToSeconds(value) {
  const str = String(value ?? "").trim();
  const match = /^([+-]?)(\d+):(\d{2})(?::(\d{2}))?$/.exec(str);
  if (!match) return null;
  const [, sign, a, b, c] = match;
  const seconds = c != null ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
  return sign === "-" ? -seconds : seconds;
}

function titleCaseName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\S+/g, (word) => word.replace(/(^|[-'])(\w)/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`));
}

function isUppercaseNameToken(value) {
  return /[A-Z]/.test(String(value ?? "")) && String(value ?? "").length > 1 && String(value ?? "") === String(value ?? "").toUpperCase();
}

function normaliseOneAthleteName(rawName) {
  const trimmed = String(rawName ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) {
    const commaIdx = trimmed.indexOf(",");
    const last = trimmed.slice(0, commaIdx).trim();
    const first = trimmed.slice(commaIdx + 1).trim();
    return titleCaseName(first && last ? `${first} ${last}` : first || last);
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && isUppercaseNameToken(parts[0]) && !isUppercaseNameToken(parts[1])) {
    return titleCaseName(`${parts.slice(1).join(" ")} ${parts[0]}`);
  }
  return titleCaseName(trimmed);
}

function firstNameFromOneAthlete(rawName) {
  const normalised = normaliseOneAthleteName(rawName);
  return normalised.split(/\s+/)[0] || null;
}

function rawAthleteName(athleteContext = {}) {
  return athleteContext.displayName ?? athleteContext.name ?? "Your athlete";
}

function athleteName(athleteContext = {}) {
  const raw = String(rawAthleteName(athleteContext));
  if (raw.includes(" & ")) {
    const parts = raw.split(" & ").map(normaliseOneAthleteName).filter(Boolean);
    return parts.length > 0 ? parts.join(" & ") : "Your athlete";
  }
  return normaliseOneAthleteName(raw) || "Your athlete";
}

function firstName(athleteContext = {}) {
  const raw = String(rawAthleteName(athleteContext));
  if (raw.includes(" & ")) {
    const parts = raw.split(" & ").map(firstNameFromOneAthlete).filter(Boolean);
    return parts.length > 0 ? parts.join(" & ") : "This athlete";
  }
  return firstNameFromOneAthlete(raw) ?? "This athlete";
}

function rankLanguage(analysisJson, athleteContext, narrative = null) {
  const worldRank = athleteContext.worldRank ? `#${athleteContext.worldRank}` : null;
  if (worldRank) return { percentile: "TOP RANK WORLDWIDE", worldRank };

  if (narrative && !narrative.rankDisplays.allowed) {
    return { percentile: "Benchmark data unavailable", worldRank: "" };
  }
  if (narrative?.rankDisplays.primary?.label) {
    const qualifier = narrative.rankDisplays.primary.qualifier;
    return { percentile: `${narrative.rankDisplays.primary.label}${qualifier ? ` (${qualifier})` : ""}`, worldRank: "" };
  }

  const overall = segment(analysisJson, "total_time");
  if (!hasBenchmarkPercentileData(analysisJson, overall, athleteContext.overallPercentile)) {
    return { percentile: "Benchmark data unavailable", worldRank: "" };
  }
  return { percentile: "BENCHMARKED RESULT", worldRank: "" };
}

function athleteRankLine(rank, athleteContext) {
  const name = athleteName(athleteContext);
  if (!rank?.percentile || rank.percentile.startsWith("BENCHMARKED RESULT")) return rank?.percentile ?? "BENCHMARKED RESULT";
  if (rank.percentile === "Benchmark data unavailable") return "Benchmark data is not available for this race format";
  if (rank.percentile === "TOP RANK WORLDWIDE") return `${name} has a top rank worldwide`;
  return `${name} is in the ${rank.percentile}`;
}

function targetSeconds(row, goalAvailable) {
  if (Number.isFinite(row?.exactTargetSeconds)) return row.exactTargetSeconds;
  if (goalAvailable && Number.isFinite(row?.goalBenchmarkSeconds)) return row.goalBenchmarkSeconds;
  return Number.isFinite(row?.benchmarkMedianSeconds) ? row.benchmarkMedianSeconds : null;
}

function targetGapSeconds(row, goalAvailable) {
  if (Number.isFinite(row?.frameGapNetOfPenaltySeconds)) return row.frameGapNetOfPenaltySeconds;
  if (Number.isFinite(row?.frameGapSeconds)) return row.frameGapSeconds;
  if (Number.isFinite(row?.timeGapToExactTargetSeconds)) return row.timeGapToExactTargetSeconds;
  if (goalAvailable && Number.isFinite(row?.goalBenchmarkSeconds) && Number.isFinite(row?.userSeconds)) {
    return row.userSeconds - row.goalBenchmarkSeconds;
  }
  return Number.isFinite(row?.timeGapToMedianSeconds) ? row.timeGapToMedianSeconds : null;
}
function flowRows(analysisJson) {
  return buildSplitDisplayRows(analysisJson).map((row) => ({
    ...row,
    name: upper(row.label),
    time: row.displayTimeFormatted ?? "-",
    raw_time: row.rawTimeFormatted,
    benchmark_time: row.comparisonTimeFormatted,
    target_time: row.comparisonTimeFormatted,
    delta: row.displayGapFormatted ?? "0",
    raw_delta: row.rawGapFormatted,
    delta_seconds: row.displayGapSeconds,
    tone: row.displayGapTone,
    penalty_adjusted: row.isPenaltyAdjusted,
    penalty_adjustment: row.penaltyAdjustmentFormatted,
    penalty_adjustment_label: row.penaltyAdjustmentLabel,
  }));
}

function flowRowsFromContract(contract = {}, analysisJson = {}) {
  const rows = Array.isArray(contract.splitProfile?.rows) && contract.splitProfile.rows.length
    ? contract.splitProfile.rows
    : buildSplitDisplayRows(analysisJson);
  return rows.map((row) => ({
    ...row,
    name: upper(row.label),
    time: row.displayTimeFormatted ?? "-",
    raw_time: row.rawTimeFormatted,
    benchmark_time: row.comparisonTimeFormatted,
    target_time: row.comparisonTimeFormatted,
    delta: row.displayGapFormatted ?? row.displayGap ?? "0",
    raw_delta: row.rawGapFormatted,
    delta_seconds: row.displayGapSeconds,
    tone: row.displayGapTone ?? row.tone,
    penalty_adjusted: row.isPenaltyAdjusted,
    penalty_adjustment: row.penaltyAdjustmentFormatted,
    penalty_adjustment_label: row.penaltyAdjustmentLabel,
  }));
}

function callouts(rows) {
  const withDeltas = rows.filter((row) => Number.isFinite(row.delta_seconds));
  const gain = [...withDeltas].filter((row) => row.delta_seconds < 0).sort((a, b) => a.delta_seconds - b.delta_seconds)[0];
  const closest = [...withDeltas].sort((a, b) => Math.abs(a.delta_seconds) - Math.abs(b.delta_seconds))[0];
  const loss = [...withDeltas].sort((a, b) => b.delta_seconds - a.delta_seconds)[0];
  return {
    biggest_gain: gain
      ? { station: gain.name, delta: formatTimeDiff(gain.delta_seconds) }
      : { station: "NO SPLIT AHEAD", delta: "0" },
    no_split_ahead: !gain,
    closest_split: closest ? { station: closest.name, delta: formatTimeDiff(closest.delta_seconds) ?? "0" } : null,
    biggest_loss: { station: loss?.name ?? "N/A", delta: loss ? formatTimeDiff(loss.delta_seconds) : "0" },
  };
}

function wordsForSeconds(seconds) {
  const n = Math.round(Math.abs(Number(seconds) || 0));
  const minutes = Math.floor(n / 60);
  const remainder = n % 60;
  if (minutes && remainder) return `${minutes} minute ${remainder} seconds.`;
  if (minutes) return `${minutes} minute${minutes === 1 ? "" : "s"}.`;
  return `${remainder} seconds.`;
}

function opportunityGap(row, analysisJson) {
  const gap = targetGapSeconds(row, hasGoalGroup(analysisJson));
  return Number.isFinite(gap) ? gap : Number(row?.timeGapSeconds ?? 0);
}

function strengthGapSeconds(row, analysisJson) {
  const gap = reportStrengthGapSeconds(row);
  if (Number.isFinite(gap)) return gap;
  const targetGap = targetGapSeconds(row, hasGoalGroup(analysisJson));
  if (Number.isFinite(targetGap)) return targetGap;
  return Number.isFinite(row?.timeGapSeconds) ? row.timeGapSeconds : null;
}

function splitGapSummary(row, analysisJson, fallback = "BENCHMARKED") {
  const gap = strengthGapSeconds(row, analysisJson);
  if (!Number.isFinite(gap)) return fallback;
  if (gap < 0) return `${formatTime(Math.abs(gap))} ahead`;
  if (gap > 0) return `${formatTime(Math.abs(gap))} gap`;
  return "On comparison";
}

function stationSubject(segment = null) {
  const labelText = displaySegmentLabel(segment, segment?.label ?? label(segment?.segmentKey)) ?? "This station";
  return segment?.type === "station" ? `The ${labelText} station` : labelText;
}

function isEliteOrHighPerformer(analysisJson = {}) {
  const finish = Number(analysisJson.race?.finishTimeSeconds);
  const achievedBand = String(analysisJson.benchmarkContext?.achievedBand ?? analysisJson.benchmarkContext?.analysisFrame?.comparisonBand ?? "");
  const total = segment(analysisJson, "total_time");
  return (Number.isFinite(finish) && finish <= 3600)
    || achievedBand === "sub_60"
    || Number(total?.percentile) >= 90
    || analysisJson.athleteArchetype?.key === "high_performer";
}

function carouselCtaHeadline(analysisJson = {}, opportunity = {}) {
  if (opportunity.hasPenaltyDominantOpportunity) return "FIX THE FASTEST WIN";
  const primary = opportunity.primaryOpportunity ?? {};
  if (primary.segmentKey === "roxzone_time" || /\broxzone\b/i.test(String(primary.label ?? ""))) {
    return "TIGHTEN YOUR RACE FLOW";
  }
  if (isEliteOrHighPerformer(analysisJson)) return "FIND YOUR NEXT MARGINAL GAIN";
  return "FIND YOUR BOTTLENECK";
}

export function buildTemplateA(analysisJson = {}, resolvedInsights = [], athleteContext = {}, contract = null) {
  const narrative = ensureHyroxReportContract({ analysisJson, athleteContext, calculatorMode: athleteContext.calculatorMode ?? analysisJson.calculatorMode, insights: resolvedInsights, contract });
  const opportunity = narrative.sourceOpportunity;
  const penalty = narrative.penalty;
  const rawFitnessLimiter = opportunity.largestFitnessLimiter ?? opportunityStation(analysisJson);
  const fitnessLimiter = rawFitnessLimiter
    ? { ...rawFitnessLimiter, label: displaySegmentLabel(rawFitnessLimiter, rawFitnessLimiter.label ?? label(rawFitnessLimiter.segmentKey)) }
    : null;
  const roxzoneAction = roxzoneActionability(analysisJson, fitnessLimiter, { isDoubles: narrative.inputFacts?.isDoubles ?? narrative.teamContext?.isDoubles });
  const primaryIsPenalty = narrative.primaryClaim?.isPenalty;
  const limiter = primaryIsPenalty && opportunity.fastestControllableWin
    ? { ...opportunity.fastestControllableWin, segmentKey: "penalties", percentile: null }
    : narrative.primaryClaim
      ? {
          ...narrative.primaryClaim,
          label: narrative.primaryClaim.label,
          timeGapSeconds: narrative.primaryClaim.gainSeconds,
          timeGapToMedianSeconds: narrative.primaryClaim.gainSeconds,
        }
      : fitnessLimiter;
  const strengthPolicy = narrative.strengthPolicy ?? {};
  const strength = strengthPolicy.strength ?? (strengthPolicy.status === "fastest_ahead_split_only" ? strengthPolicy.fastestAheadSplit : null) ?? bestStation(analysisJson);
  const strengthDataQualityNote = strengthPolicy.dataQualityNote ?? dataQualityNote(analysisJson);
  const strengthGap = Number.isFinite(strengthPolicy.displayGap)
    ? null
    : strengthGapSeconds(strength, analysisJson);
  const gain = primaryIsPenalty && opportunity.fastestControllableWin
    ? penalty.totalPenaltySeconds
    : analysisJson.timePotential?.headlineGainSeconds ?? analysisJson.headline?.headlineGainSeconds ?? limiter?.timeGapSeconds ?? limiter?.timeGapToMedianSeconds ?? 0;
  const rank = rankLanguage(analysisJson, athleteContext, narrative);
  const rows = flowRowsFromContract(narrative, analysisJson);
  const fallbackCallouts = callouts(rows);
  const rowCallouts = {
    ...fallbackCallouts,
    biggest_gain: narrative.artifactSlots?.carousel?.slide2Gain ?? fallbackCallouts.biggest_gain,
    biggest_loss: narrative.artifactSlots?.carousel?.slide2Loss ?? fallbackCallouts.biggest_loss,
    no_split_ahead: narrative.splitProfile?.biggestGain ? false : fallbackCallouts.no_split_ahead,
  };
  const basis = comparisonProfileLabel(analysisJson);
  const displayRows = rows.map((row) => ({ ...row, comparison_basis: basis }));
  // Mirrors the penalty row pinned to the top of the email's FULL SPLIT DETAIL table
  // (emailReportBuilder.js's penaltyRowHtml) -- same condition, same source of truth.
  const totalPenaltySeconds = penalty?.totalPenaltySeconds ?? 0;
  const penaltyRow = totalPenaltySeconds > 0
    ? {
        name: "PENALTIES",
        time: formatTime(totalPenaltySeconds) ?? "-",
        delta: formatTimeDiff(totalPenaltySeconds) ?? "+0:00",
        tone: "penalty",
        comparison_basis: basis,
      }
    : null;
  const stationRows = penaltyRow ? [penaltyRow, ...displayRows] : displayRows;
  const targetSecs = athleteContext.targetFinishTimeSeconds ?? athleteContext.targetTimeSeconds ?? null;
  const hasTarget = Number.isFinite(targetSecs) && targetSecs > 0;
  const featureList = Array.isArray(narrative.artifactSlots?.carousel?.features)
    ? narrative.artifactSlots.carousel.features
    : narrative.rankPolicy.allowed
      ? DEFAULT_FEATURES
      : DEFAULT_NO_PERCENTILE_FEATURES;
  const slide1Metric2 = narrative.artifactSlots?.carousel?.slide1Metric2 ?? {
    label: hasTarget ? "TARGET" : "BENCHMARK",
    value: hasTarget ? (formatTime(targetSecs) ?? "UNAVAILABLE") : "UNAVAILABLE",
  };

  return {
    template_id: "A",
    template_name: "Athlete Breakdown",
    brand: {
      product: "FORMA",
      site: "www.getforma.fit",
      strapline: "Measure. Understand. Improve.",
    },
    slides: [
      {
        slide_id: "A1_ATHLETE_HOOK",
        report_type: "HYROX PERFORMANCE ANALYSIS",
        athlete_name: athleteName(athleteContext),
        athlete_image: athleteContext.athleteImage || resolveHeroImage(analysisJson, athleteContext),
        percentile: athleteRankLine(rank, athleteContext),
        limiter_word: upper(displaySegmentLabel(limiter, limiter?.label ?? label(limiter?.segmentKey)) ?? "OPPORTUNITY"),
        headline_suffix: gain >= 60 ? "COST TIME" : "SETS THE STORY",
        hero_number: formatGain(gain) ?? "0:00",
        overall_time: formatTime(analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds) ?? "-",
        metric2_label: slide1Metric2.label,
        metric2_value: slide1Metric2.value,
        world_rank: slide1Metric2.value,
        best_station: narrative.artifactSlots?.carousel?.strengthLabel ?? (strength ? upper(strength.label ?? label(strength.segmentKey)) : "NO RELIABLE STRENGTH"),
        biggest_limiter: upper(displaySegmentLabel(limiter, limiter?.label ?? label(limiter?.segmentKey)) ?? "N/A"),
        biggest_limiter_label: primaryIsPenalty
          ? "FASTEST CONTROLLABLE WIN"
          : upper(narrative.primaryClaim?.compactLabel ?? "BIGGEST LIMITER"),
        fastest_controllable_win: opportunity.fastestControllableWin
          ? {
              station: upper(opportunity.fastestControllableWin.label),
              potential_gain: formatGain(opportunity.fastestControllableWin.timeGapSeconds) ?? "0:00",
              label: "FASTEST CONTROLLABLE WIN",
            }
          : null,
        largest_fitness_limiter: fitnessLimiter
          ? {
              station: upper(displaySegmentLabel(fitnessLimiter, fitnessLimiter.label ?? label(fitnessLimiter.segmentKey)) ?? "N/A"),
              time_gap: formatGain(fitnessLimiter.timeGapSeconds) ?? null,
              label: "LARGEST FITNESS LIMITER",
            }
          : null,
        artifact_headline_mode: narrative.headlineMode,
        narrative_primary: narrative.primaryClaim?.normalizedLabel ?? null,
        data_quality_note: narrative.dataQualityPolicy?.compactCaveat ?? null,
        roxzone_action: roxzoneAction
          ? {
              label: roxzoneAction.carouselAction,
              claim_confidence: narrative.primaryClaim?.claimStrength ?? narrative.dataQualityPolicy?.confidence ?? null,
              action_evidence_level: roxzoneAction.actionEvidenceLevel,
              detail: roxzoneAction.confidenceText,
            }
          : null,
        swipe_prompt: "Swipe to see where time was gained and lost.",
        regional_context: regionalContextLine(analysisJson) ?? null,
        age_group_context: ageGroupContextLine(analysisJson) ?? null,
      },
      {
        slide_id: "A2_POSITION_FLOW",
        title: "WHERE TIME WAS GAINED AND LOST",
        comparison_basis: basis,
        legend_text: `BLUE = FASTER THAN ${basis}    RED = SLOWER THAN ${basis}`,
        ...rowCallouts,
        stations: stationRows,
      },
      {
        slide_id: "A3_BIGGEST_STRENGTH",
        strength_heading: strengthPresentationLabel(strengthPolicy.status),
        station: narrative.artifactSlots?.carousel?.strengthLabel ?? (strength ? upper(strength.label ?? label(strength.segmentKey)) : "NO RELIABLE STRENGTH"),
        percentile: strengthPolicy.status === "fastest_ahead_split_only"
          ? "Best relative split"
          : strength ? splitGapSummary(strength, analysisJson) : "Limited split data",
        position_gain: strengthPolicy.displayGap
          ? String(strengthPolicy.displayGap).replace(/^-/, "+")
          : strength && Number.isFinite(strengthGap) ? (formatTimeDiff(Math.abs(strengthGap)) ?? "+0:00") : "N/A",
        position_gain_label: `TIME AHEAD OF ${basis}`,
        // Plain-language parts for the social carousel slide (Phase 13 sign convention) — the
        // strength slide is definitionally a "faster" claim, so the direction always reads FASTER;
        // "position_gain"/"position_gain_label" above are kept for any other consumer of this data.
        // Falls back to parsing strengthPolicy.displayGap when strengthGap itself isn't a finite
        // number, since the "fastest_ahead_split_only" policy branch only carries a formatted string.
        ...(() => {
          const magnitude = Number.isFinite(strengthGap)
            ? Math.abs(strengthGap)
            : Math.abs(parseSignedTimeToSeconds(strengthPolicy.displayGap) ?? NaN);
          const parts = strength && Number.isFinite(magnitude) ? formatSocialGapParts(-magnitude) : null;
          return {
            position_gain_value: parts?.value ?? "NO DATA",
            position_gain_unit: parts?.unit ?? null,
            position_gain_direction: parts?.direction ?? null,
          };
        })(),
        position_gain_sublabel: `THAN ${basis}`,
        caption: strengthPolicy.explanation ?? (strength
          ? `${stationSubject(strength)} is the strongest benchmarked area in this result.`
          : "No reliable strongest station could be identified from the available split data."),
        data_quality_note: strengthDataQualityNote,
      },
      {
        slide_id: "A4_BIGGEST_OPPORTUNITY",
        station: upper(displaySegmentLabel(limiter, limiter?.label ?? label(limiter?.segmentKey)) ?? "N/A"),
        label: primaryIsPenalty
          ? "Fastest Win"
          : narrative.primaryClaim?.claimStrength === "firm"
            ? "Opportunity"
            : (narrative.primaryClaim?.compactLabel ?? "Opportunity"),
        potential_gain: formatGain(gain) ?? "0:00",
        potential_gain_text: wordsForSeconds(gain),
        current_station_rank: primaryIsPenalty ? "EXECUTION" : splitGapSummary(limiter, analysisJson),
        // Plain-language parts replacing the old three-times-repeated gap (giant number + prose
        // restatement + "current split gap" line) — Phase 6. One value + one word instead.
        ...(() => {
          const parts = primaryIsPenalty ? null : formatSocialMagnitudeParts(gain);
          return {
            opportunity_value: parts?.value ?? (primaryIsPenalty ? "CLEAN EXECUTION" : "N/A"),
            opportunity_unit: parts?.unit ?? null,
            opportunity_word: primaryIsPenalty ? "RECOVERABLE" : (parts ? "TO FIND" : null),
          };
        })(),
        opportunity_sublabel: `VS ${basis}`,
        action_text: roxzoneAction?.carouselAction ?? null,
        confidence_note: roxzoneAction?.confidenceText ?? narrative.dataQualityPolicy?.compactCaveat ?? null,
      },
      {
        slide_id: "A5_KEY_INSIGHT",
        athlete_first_name: firstName(athleteContext),
        gain_text: strength ? `${splitGapSummary(strength, analysisJson, "a stronger benchmark")} performance` : "no clear strength signal",
        gain_station: String(strength?.label ?? "available split data").toLowerCase(),
        loss_text: `${formatGain(gain) ?? "time"} potential gain`,
        loss_station: String(displaySegmentLabel(limiter, limiter?.label) ?? "the limiter").toLowerCase(),
        outcome_text: athleteContext.targetLabel ?? "YOUR NEXT PB",
        insight: `Closing this gap could move ${firstName(athleteContext)} closer to ${athleteContext.targetLabel ?? "the next target"}.`,
        // Fewer words, bigger text (Phase 7): a strength/opportunity pair the slide renders as two
        // large stat blocks, plus one short interpretation line — all derived from the same
        // strength/limiter data already computed above, not new analysis.
        gain_station_name: strength ? upper(strength.label ?? label(strength.segmentKey)) : "NO CLEAR STRENGTH",
        ...(() => {
          const magnitude = Number.isFinite(strengthGap)
            ? Math.abs(strengthGap)
            : Math.abs(parseSignedTimeToSeconds(strengthPolicy.displayGap) ?? NaN);
          const parts = strength && Number.isFinite(magnitude) ? formatSocialGapParts(-magnitude) : null;
          return {
            gain_value: parts?.value ?? null,
            gain_unit: parts?.unit ?? null,
            gain_direction: parts?.direction ?? null,
          };
        })(),
        loss_station_name: upper(displaySegmentLabel(limiter, limiter?.label ?? label(limiter?.segmentKey)) ?? "N/A"),
        ...(() => {
          const parts = primaryIsPenalty ? null : formatSocialMagnitudeParts(gain);
          return {
            loss_value: parts?.value ?? (primaryIsPenalty ? "CLEAN EXECUTION" : null),
            loss_unit: parts?.unit ?? null,
            loss_word: primaryIsPenalty ? "RECOVERABLE" : (parts ? "TO FIND" : null),
          };
        })(),
        insight_short: `Closing your clearest gap could move you closer to ${athleteContext.targetLabel ?? "your next PB"}.`,
      },
      {
        slide_id: "A6_CTA",
        headline: narrative.artifactSlots?.carousel?.ctaHeadline ?? narrative.targetAssessment?.ctaHeadline ?? carouselCtaHeadline(analysisJson, opportunity),
        body: "Analyse your HYROX result. Free.",
        ctaLabel: "Analyse my result",
        ctaType: "calculator_link",
        button: "ANALYSE MY HYROX RESULT",
        features: [...featureList],
      },
    ],
    selected_insights: resolvedInsights.map((insight) => insight.id),
  };
}

function gapRows(groupKey) {
  return STATION_KEYS.map((key) => {
    const stats = getBenchmarkStats(groupKey, key);
    const median = Number(stats?.medianSeconds ?? stats?.p50Seconds);
    const p25 = Number(stats?.p25Seconds);
    const gap = Number.isFinite(median) && Number.isFinite(p25) ? Math.max(0, median - p25) : 0;
    return { segmentKey: key, name: label(key), gapSeconds: Math.round(gap), sampleSize: Number(stats?.sampleSize ?? 0) };
  }).sort((a, b) => (b.gapSeconds - a.gapSeconds) || a.name.localeCompare(b.name));
}

function sampleDisplay(rows) {
  const sample = Math.max(0, ...rows.map((row) => row.sampleSize));
  if (sample >= 1000) return `${Math.floor(sample / 1000)},000+`;
  return `${sample}+`;
}

export function buildTemplateB(benchmarkGroupKey, targetBand = "sub-75") {
  const rows = gapRows(benchmarkGroupKey);
  const top = rows[0] ?? { name: "Wall Balls", gapSeconds: 0 };
  const sledTopTwo = rows.slice(0, 2).some((row) => ["sled_push", "sled_pull"].includes(row.segmentKey));
  const sample = sampleDisplay(rows);
  const topFive = rows.slice(0, 5);

  return {
    template: "population-research",
    brand: "FORMA",
    category: "HYROX POPULATION RESEARCH",
    footerUrl: "www.getforma.fit",
    footerMeta: `FORMA | MEASURE. UNDERSTAND. IMPROVE. | ${sample} RESULTS`,
    hook: {
      sampleSize: `${sample} RESULTS ANALYSED`,
      question: `What stops athletes breaking ${targetBand.replace("sub-", "")} minutes?`,
      headline: sledTopTwo ? `${top.name} is the biggest HYROX bottleneck` : "The biggest HYROX bottleneck isn't the sled",
      metrics: [
        { label: "Target Time", value: `${targetBand.replace("sub-", "")}:00` },
        { label: "Results Analysed", value: sample },
        { label: "Most Common Limiter", value: top.name, tone: "negative" },
        { label: "Largest Gap", value: top.name, tone: "negative" },
      ],
      swipePrompt: "Swipe to see where athletes really lose time",
    },
    losses: {
      title: "Where athletes lose time",
      primary: { label: top.name, value: `-${formatGain(top.gapSeconds)}` },
      secondary: { label: topFive[1]?.name ?? "Running Fatigue", value: `-${formatGain(topFive[1]?.gapSeconds ?? 0)}` },
      rows: topFive.map((row, index) => ({
        rank: `#${index + 1}`,
        name: row.name,
        gap: formatGain(row.gapSeconds),
        loss: `-${formatGain(row.gapSeconds)}`,
      })),
    },
    limiter: {
      eyebrow: "#1 Biggest limiter",
      title: top.name,
      label: "Average time lost",
      heroNumber: formatGain(top.gapSeconds),
      subLabel: `Versus ${targetBand} athletes`,
      caption: "The single largest time gap in this benchmark band.",
    },
    opportunity: {
      eyebrow: "Biggest opportunity",
      title: topFive[1]?.name ?? top.name,
      label: "Secondary gap",
      heroNumber: formatGain(topFive[1]?.gapSeconds ?? top.gapSeconds),
      caption: "The next largest pattern after the primary limiter.",
      tag: "Benchmark gap ranking",
    },
    insight: {
      title: "What nobody expects",
      lines: [
        { text: "Most athletes focus on ", highlight: "sleds", suffix: ".", tone: "positive" },
        { text: "This cohort loses more time on ", highlight: top.name.toLowerCase(), suffix: ".", tone: "negative" },
        { text: "Improving the biggest gap has the greatest impact on finishing time.", highlight: "", suffix: "", tone: "neutral" },
      ],
      hero: "Train smarter",
    },
    cta: {
      title: "Discover your HYROX bottleneck",
      bullets: [...DEFAULT_FEATURES],
      button: "Analyse my HYROX result",
      brandLine: "Measure. Understand. Improve.",
    },
  };
}

export function buildTemplateStub(template) {
  console.warn(`[hyrox] template ${template} is not implemented in v1`);
  return { template, status: "not_implemented_v1" };
}
