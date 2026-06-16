import { getBenchmarkStats } from "../engine/benchmarkService.js";
import { STATION_KEYS } from "../config/segmentMap.js";
import { formatGain, formatPercentile, formatTime, label } from "./copyFormatter.js";

function daysToRace(athleteContext = {}) {
  if (athleteContext?.daysToRace !== null && athleteContext?.daysToRace !== undefined) {
    const explicit = Number(athleteContext?.daysToRace);
    if (Number.isFinite(explicit)) return explicit;
  }
  const date = athleteContext?.nextRaceDate ?? athleteContext?.raceDate;
  if (!date) return null;
  const race = new Date(date);
  return Number.isNaN(race.getTime()) ? null : Math.ceil((race.getTime() - Date.now()) / 86400000);
}

function horizon(days) {
  if (!Number.isFinite(days) || days < 0) return "Next training block";
  if (days < 14) return "This week: pacing, transitions, recovery";
  if (days < 42) return "3-6 weeks: targeted sharpening";
  if (days < 84) return "6-12 weeks: focused block";
  return "3+ months: development block";
}

function shoulderConstraint(athleteContext = {}) {
  return /shoulder/i.test(String(athleteContext.injuryConstraints ?? athleteContext.injuryNotes ?? ""));
}

function baseLimiter(analysisJson = {}) {
  return analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
}

function stationActionId(segmentKey) {
  return segmentKey ? `station_${segmentKey}` : "station_specificity";
}

function formatPacePerKm(seconds) {
  const n = Math.round(Math.abs(Number(seconds)));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 60) return `${n}s`;
  const mins = Math.floor(n / 60);
  const secs = n % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function buildGapBreakdown(analysisJson = {}) {
  const GAP_THRESHOLD = 30;
  const contributors = [];

  const stationItems = (analysisJson.stationBreakdown ?? [])
    .filter((station) => station.confidence !== "low" && station.timeGapSeconds >= GAP_THRESHOLD)
    .slice(0, 3);
  stationItems.forEach((station) => contributors.push({ label: station.label, gainSeconds: station.timeGapSeconds }));

  const runSegments = (analysisJson.segments ?? []).filter(
    (segment) => segment.type === "run" && Number.isFinite(segment.timeGapToMedianSeconds) && segment.timeGapToMedianSeconds > 0,
  );
  const totalRunGap = runSegments.reduce((sum, segment) => sum + segment.timeGapToMedianSeconds, 0);
  if (totalRunGap >= GAP_THRESHOLD) {
    const perKmSeconds = Math.round(totalRunGap / 8);
    const pace = formatPacePerKm(perKmSeconds);
    const paceLabel = perKmSeconds >= 5 && pace ? `Running pace (~${pace}/km)` : "Running";
    contributors.push({ label: paceLabel, gainSeconds: Math.round(totalRunGap) });
  }

  const totalPenalty = (analysisJson.penalties ?? []).reduce(
    (sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0),
    0,
  );
  if (totalPenalty > 0) {
    contributors.push({ label: "Penalties", gainSeconds: Math.round(totalPenalty) });
  }

  const rox = analysisJson.roxzoneAnalysis;
  if (rox?.available && (rox.percentile ?? 100) < 45) {
    const roxGap = rox.timeGapToMedianSeconds
      ?? (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "roxzone_time")?.timeGapToMedianSeconds
      ?? null;
    if (Number.isFinite(roxGap) && roxGap >= GAP_THRESHOLD) {
      const gapLabel = rox.mode === "inferred_total" ? "Transitions (estimated)" : "Transitions (Roxzone)";
      contributors.push({ label: gapLabel, gainSeconds: Math.round(roxGap) });
    }
  }

  const sorted = contributors.sort((a, b) => b.gainSeconds - a.gainSeconds).slice(0, 4);
  return sorted.length >= 2 ? sorted : [];
}

export function formatGapBreakdown(items) {
  const parts = items.map((item, index) => `${index + 1}/ ${item.label} (${formatGain(item.gainSeconds)})`);
  return `Likely contributors: ${parts.join(" ")}`;
}

function buildStationContributors(analysisJson, targetTimeString, useGoalGap) {
  const contributors = [];
  const GAP_THRESHOLD = 30;

  const totalPenalty = (analysisJson.penalties ?? []).reduce(
    (sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0),
    0,
  );
  if (totalPenalty > 0) {
    const time = formatGain(totalPenalty);
    contributors.push({
      label: "Penalties",
      gainSeconds: Math.round(totalPenalty),
      copy: `eliminate these and gain ${time}`,
    });
  }

  const segmentMap = new Map((analysisJson.segments ?? []).map((segment) => [segment.segmentKey, segment]));
  const stationItems = (analysisJson.stationBreakdown ?? [])
    .filter((station) => station.confidence !== "low" && station.timeGapSeconds >= GAP_THRESHOLD);

  for (const station of stationItems) {
    const segment = segmentMap.get(station.segmentKey ?? "");
    const gainSeconds = Number.isFinite(segment?.timeGapToExactTargetSeconds) && segment.timeGapToExactTargetSeconds > 0
      ? Math.round(segment.timeGapToExactTargetSeconds)
      : useGoalGap && Number.isFinite(segment?.timeGapToGoalSeconds) && segment.timeGapToGoalSeconds > 0
        ? Math.round(segment.timeGapToGoalSeconds)
        : Math.round(station.timeGapSeconds);
    if (gainSeconds < GAP_THRESHOLD) continue;
    const time = formatGain(gainSeconds);
    contributors.push({
      label: station.label,
      gainSeconds,
      copy: targetTimeString
        ? `athletes finishing in ${targetTimeString} complete these ~${time} faster`
        : `~${time} above the median`,
    });
  }

  return contributors.sort((a, b) => b.gainSeconds - a.gainSeconds).slice(0, 3);
}

function buildRunGapSummary(analysisJson, targetTimeString, useGoalGap) {
  const runSegments = (analysisJson.segments ?? []).filter((segment) => segment.type === "run");
  let totalGap = 0;

  for (const segment of runSegments) {
    const gap =
      Number.isFinite(segment.timeGapToExactTargetSeconds) && segment.timeGapToExactTargetSeconds > 0
        ? segment.timeGapToExactTargetSeconds
        : useGoalGap && Number.isFinite(segment.timeGapToGoalSeconds) && segment.timeGapToGoalSeconds > 0
          ? segment.timeGapToGoalSeconds
          : Number.isFinite(segment.timeGapToMedianSeconds) && segment.timeGapToMedianSeconds > 0
            ? segment.timeGapToMedianSeconds
            : 0;
    totalGap += gap;
  }

  totalGap = Math.round(totalGap);
  if (totalGap < 60) return null;

  const gainTime = formatGain(totalGap);
  const perKmSeconds = Math.round(totalGap / 8);
  const pace = formatPacePerKm(perKmSeconds);
  const paceClause = perKmSeconds >= 5 && pace ? ` (~${pace}/km faster)` : "";

  return {
    gainSeconds: totalGap,
    copy: targetTimeString
      ? `athletes finishing in ${targetTimeString} typically run${paceClause}, saving ~${gainTime} across the race`
      : `estimated ~${gainTime} above the median across all runs`,
  };
}

function safePush(items, item) {
  if (!item) return;
  if (items.some((existing) => existing.title === item.title)) return;
  if (items.length < 3) items.push({ ...item, priority: items.length + 1 });
}

function penaltyRecommendation(analysisJson = {}, timeHorizon) {
  const penalties = analysisJson.penalties ?? [];
  const totalPenalty = penalties.reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  if (totalPenalty < 120) return null;
  const affectedStations = penalties
    .map((penalty) => {
      const runNum = String(penalty.runKey ?? penalty.segmentKey ?? "").match(/\d+/)?.[0];
      return runNum ? STATION_KEYS[Number(runNum) - 2] : null;
    })
    .filter(Boolean);
  const stationCopy = affectedStations.length > 0
    ? ` around ${affectedStations.map((station) => label(station)).join(", ")}`
    : "";
  return {
    title: "Penalty avoidance",
    actionId: "penalty_avoidance",
    rationale: `Avoid the penalt${penalties.length > 1 ? "ies" : "y"}${stationCopy}: this result includes ${formatGain(totalPenalty)} of recorded penalties, which is a direct race-day execution gain before any fitness improvement.`,
    timeHorizon,
    safetyNote: null,
  };
}

export function buildRecommendations(analysisJson = {}, insights = [], athleteContext = {}) {
  const days = daysToRace(athleteContext);
  const timeHorizon = horizon(days);
  const executionOnly = Number.isFinite(days) && days > 0 && days < 14;
  const noVolume = Number.isFinite(days) && days > 0 && days < 28;
  const limiter = baseLimiter(analysisJson);
  const items = [];
  const goalGroupKey = analysisJson.benchmarkContext?.goalBenchmarkGroup?.key ?? null;
  const targetSeconds = athleteContext.targetFinishTimeSeconds ?? null;
  const targetTimeString = Number.isFinite(Number(targetSeconds)) && Number(targetSeconds) > 0
    ? formatTime(Number(targetSeconds))
    : null;
  const useGoalGap = !!(goalGroupKey && targetTimeString);
  const stationContributors = buildStationContributors(analysisJson, targetTimeString, useGoalGap);
  const runGapSummary = buildRunGapSummary(analysisJson, targetTimeString, useGoalGap);

  if (!executionOnly && limiter) {
    const isRun = limiter.segmentKey?.startsWith("run") || limiter.segmentKey === "run_time";
    if (!(noVolume && isRun)) {
      safePush(items, {
        title: `${isRun ? "Running" : limiter.label ?? label(limiter.segmentKey)} focus`,
        actionId: isRun ? "run_volume_base" : stationActionId(limiter.segmentKey),
        rationale: (() => {
          const limiterLabel = isRun ? "Running" : limiter.label ?? label(limiter.segmentKey);
          const base = `${limiterLabel}: ${formatPercentile(limiter.percentile) ?? "below benchmark"}`;
          if (isRun) {
            if (targetTimeString && runGapSummary) {
              return `${base}. To finish in ${targetTimeString} your average run pace needs to improve by ${runGapSummary.copy}.`;
            }
            return `${base}, estimated gap of ${formatGain(limiter.timeGapSeconds)}.`;
          }
          if (targetTimeString) {
            const gain = formatGain(analysisJson.timePotential?.goalBasedGainSeconds ?? analysisJson.timePotential?.headlineGainSeconds ?? limiter.timeGapSeconds);
            return `${base}. To finish in your target time of ${targetTimeString} you need to find ${gain} across your stations and penalties.`;
          }
          return `${base}, estimated gap of ${formatGain(analysisJson.timePotential?.headlineGainSeconds ?? limiter.timeGapSeconds)}.`;
        })(),
        contributors: isRun ? [] : stationContributors,
        runGapNote: !isRun && runGapSummary
          ? `Your running also contributed an estimated ${formatGain(runGapSummary.gainSeconds)} to the gap - see pacing below.`
          : null,
        targetTimeCopy: targetTimeString,
        timeHorizon,
        safetyNote: shoulderConstraint(athleteContext) && /wall/i.test(limiter.label ?? "") ? "Because you noted a shoulder constraint, overhead station work should be progressed carefully rather than simply adding high-volume loading." : null,
      });
    }
  }

  const engine = Number(analysisJson.scores?.engineScore);
  const strength = Number(analysisJson.scores?.strengthScore);
  if (!executionOnly && Number.isFinite(engine) && Number.isFinite(strength) && Math.abs(engine - strength) >= 15) {
    const title = engine < strength ? "Aerobic durability" : "Station strength endurance";
    safePush(items, {
      title,
      actionId: engine < strength ? "compromised_running" : "station_strength_endurance",
      rationale: `Engine and strength scores are separated by ${Math.abs(engine - strength)} points.`,
      timeHorizon,
      safetyNote: null,
    });
  }

  if (analysisJson.roxzoneAnalysis?.available && (analysisJson.roxzoneAnalysis.percentile ?? 100) < 45) {
    safePush(items, {
      title: "Roxzone execution",
      actionId: "roxzone_rehearsal",
      rationale: (() => {
        const rox = analysisJson.roxzoneAnalysis;
        const pct = formatPercentile(rox?.percentile);
        const roxSegment = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "roxzone_time");
        const roxGap = Number.isFinite(roxSegment?.timeGapToExactTargetSeconds)
          ? roxSegment.timeGapToExactTargetSeconds
          : rox?.timeGapToMedianSeconds;
        if (pct && Number.isFinite(roxGap) && roxGap > 0) {
          return `Your transition time places you at the ${pct} - approximately ${formatGain(roxGap)} above the benchmark median. Transitions are an efficiency gain that requires no extra training load, only focused race rehearsal.`;
        }
        if (pct) {
          return `Your transition time places you at the ${pct}. Improving transitions requires no additional training load - only race rehearsal.`;
        }
        return "Transition time is a low-risk efficiency opportunity that requires no extra training load.";
      })(),
      timeHorizon,
      safetyNote: null,
    });
  }

  if (analysisJson.runningAnalysis?.available && (analysisJson.runningAnalysis.runFadePct ?? 0) >= 8) {
    safePush(items, {
      title: "Pacing under fatigue",
      actionId: "race_pacing",
      rationale: (() => {
        const fade = analysisJson.runningAnalysis.runFadePct;
        const diagnosis = analysisJson.runningAnalysis.run1PacingDiagnosis ?? "unavailable";
        const run1Pct = analysisJson.runningAnalysis.run1VsMedianPct;
        const goalFadeStats = goalGroupKey ? getBenchmarkStats(goalGroupKey, "run_fade_pct") : null;
        const goalFadeMedian = goalFadeStats?.medianSeconds ?? null;
        const goalFadeP25 = goalFadeStats?.p25Seconds ?? null;
        const fadeRange = goalFadeMedian && goalFadeP25 && targetTimeString
          ? `${Math.round(goalFadeP25)}-${Math.round(goalFadeMedian)}%`
          : goalFadeMedian && targetTimeString
            ? `around ${Math.round(goalFadeMedian)}%`
            : null;

        if (diagnosis === "started_too_fast") {
          const pctStr = Number.isFinite(run1Pct) ? `~${Math.round(run1Pct)}%` : "notably";
          const parts = [
            `Run fade was ${fade}%, and your Run 1 was ${pctStr} faster than your average across the race - a classic opening too-fast pattern.`,
          ];
          if (fadeRange) parts.push(`Athletes finishing around ${targetTimeString} typically open within 3-5% of their race average and fade ${fadeRange}.`);
          parts.push("In training, practise starting conservatively and building through the middle runs (negative splits).");
          return parts.join(" ");
        }

        const parts = [`Run fade was ${fade}%.`];
        if (fadeRange) parts.push(`Athletes finishing around ${targetTimeString} typically fade ${fadeRange}.`);
        parts.push("Pace held through the mid-race runs but dropped in the later legs, pointing to accumulated station fatigue.");
        parts.push("Station endurance work and tempo running under fatigue will help close this gap.");
        return parts.join(" ");
      })(),
      timeHorizon,
      safetyNote: null,
    });
  }

  if (
    !executionOnly
    && (analysisJson.runningAnalysis?.runFadePct ?? 0) < 8
    && runGapSummary
    && runGapSummary.gainSeconds >= 120
    && limiter
    && !(limiter.segmentKey?.startsWith("run") || limiter.segmentKey === "run_time")
  ) {
    safePush(items, {
      title: "Running pace",
      actionId: "run_volume_base",
      rationale: runGapSummary.copy,
      timeHorizon,
      safetyNote: null,
    });
  }

  if (executionOnly) {
    return [
      { priority: 1, title: "Race execution", actionId: "race_pacing", rationale: "Race day is close, so keep work low-risk and specific.", timeHorizon, safetyNote: "With limited time before race day, focus should be on execution, pacing and low-risk efficiency gains rather than aggressive volume increases." },
      { priority: 2, title: "Transitions", actionId: "roxzone_rehearsal", rationale: "Clean station entry and exit can improve race flow without adding training load.", timeHorizon, safetyNote: null },
      { priority: 3, title: "Recovery and sharpness", actionId: "maintain_taper", rationale: "Keep sharpness while avoiding new fatigue.", timeHorizon, safetyNote: null },
    ];
  }

  if (items.length === 0) {
    safePush(items, { title: "Maintain strengths", actionId: "maintain_taper", rationale: "No single high-confidence limiter dominates this result.", timeHorizon, safetyNote: null });
  }

  return items.slice(0, 3).map((item, index) => ({ ...item, priority: index + 1 }));
}
