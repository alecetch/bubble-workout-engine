import { formatGain, label } from "./copyFormatter.js";

function daysToRace(athleteContext = {}) {
  const explicit = Number(athleteContext?.daysToRace);
  if (Number.isFinite(explicit)) return explicit;
  const date = athleteContext?.nextRaceDate ?? athleteContext?.raceDate;
  if (!date) return null;
  const race = new Date(date);
  return Number.isNaN(race.getTime()) ? null : Math.ceil((race.getTime() - Date.now()) / 86400000);
}

function horizon(days) {
  if (Number.isFinite(days) && days < 14) return "This week: pacing, transitions, recovery";
  if (Number.isFinite(days) && days < 42) return "3-6 weeks: targeted sharpening";
  if (Number.isFinite(days) && days < 84) return "6-12 weeks: focused block";
  return "3+ months: development block";
}

function shoulderConstraint(athleteContext = {}) {
  return /shoulder/i.test(String(athleteContext.injuryConstraints ?? athleteContext.injuryNotes ?? ""));
}

function baseLimiter(analysisJson = {}) {
  return analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
}

function safePush(items, item) {
  if (!item) return;
  if (items.some((existing) => existing.title === item.title)) return;
  if (items.length < 3) items.push({ ...item, priority: items.length + 1 });
}

export function buildRecommendations(analysisJson = {}, insights = [], athleteContext = {}) {
  const days = daysToRace(athleteContext);
  const timeHorizon = horizon(days);
  const executionOnly = Number.isFinite(days) && days < 14;
  const noVolume = Number.isFinite(days) && days < 28;
  const limiter = baseLimiter(analysisJson);
  const items = [];

  if (!executionOnly && limiter) {
    const isRun = limiter.segmentKey?.startsWith("run") || limiter.segmentKey === "run_time";
    if (!(noVolume && isRun)) {
      safePush(items, {
        title: `${limiter.label ?? label(limiter.segmentKey)} focus`,
        actionId: isRun ? "run_volume_base" : "station_specificity",
        rationale: `Highest estimated opportunity: ${formatGain(analysisJson.timePotential?.headlineGainSeconds ?? limiter.timeGapSeconds)} potential gain.`,
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
      rationale: "Transition time is a low-risk efficiency opportunity.",
      timeHorizon,
      safetyNote: null,
    });
  }

  if (analysisJson.runningAnalysis?.available && (analysisJson.runningAnalysis.runFadePct ?? 0) >= 8) {
    safePush(items, {
      title: "Pacing under fatigue",
      actionId: "race_pacing",
      rationale: `Run fade was ${analysisJson.runningAnalysis.runFadePct}%, so race execution is worth rehearsing.`,
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
