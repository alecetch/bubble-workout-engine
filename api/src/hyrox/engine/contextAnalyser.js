function daysBetween(start, end) {
  const a = new Date(start);
  const b = new Date(end);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return null;
  return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
}

function timeToRaceTier(daysToRace) {
  if (!Number.isFinite(daysToRace)) return null;
  if (daysToRace < 14) return { framingTier: "race_week", guidance: "Prioritise execution, pacing, and recovery only." };
  if (daysToRace <= 42) return { framingTier: "small_targeted_improvements", guidance: "Choose one or two small, targeted fixes." };
  if (daysToRace <= 84) return { framingTier: "focused_station_and_run_work", guidance: "There is time for focused station and run development." };
  return { framingTier: "broader_capacity_building", guidance: "Use the runway for broader aerobic and strength-capacity building." };
}

export function analyseContext(normalisedSubmission, scores, limiter) {
  const performance = normalisedSubmission.performanceContext ?? {};
  const athleteContext = normalisedSubmission.athleteContext ?? {};

  const runningCapacityGap = Number.isFinite(performance.fiveKmPbSeconds) && Number.isFinite(normalisedSubmission.runTimeSeconds)
    ? (() => {
        const fiveKmPacePerKm = performance.fiveKmPbSeconds / 5;
        const hyroxAvgRunPace = normalisedSubmission.runTimeSeconds / 8;
        const paceGapPerKm = hyroxAvgRunPace - fiveKmPacePerKm;
        return {
          paceGapPerKm: Math.round(paceGapPerKm),
          interpretation: paceGapPerKm > 30 ? "fatigue_degradation_likely" : "running_capacity_translates_well",
        };
      })()
    : null;

  const strengthProvided = [performance.backSquatKg, performance.deadliftKg, performance.frontSquatKg].some(Number.isFinite);
  const strengthTranslation = strengthProvided && limiter
    ? {
        signal: scores.strengthScore >= 65 && limiter.type === "station" ? "strength_capacity_not_primary_limit" : "strength_capacity_may_limit_stations",
        interpretation: scores.strengthScore >= 65 && limiter.type === "station"
          ? "Station gap is more likely technique, endurance, or repeatability than absolute strength."
          : "Strength capacity may be contributing to station performance.",
      }
    : null;

  const previousRaces = Number(athleteContext.previousHyroxRaces ?? 0);
  const experienceExecution = {
    interpretation: previousRaces <= 0
      ? "first_timer_race_craft_opportunity"
      : previousRaces >= 3
        ? "experienced_execution_gap_is_more_actionable"
        : "some_experience_refine_execution",
  };

  const daysToRace = athleteContext.nextRaceDate ? daysBetween(new Date().toISOString().slice(0, 10), athleteContext.nextRaceDate) : null;
  const tier = timeToRaceTier(daysToRace);

  return {
    runningCapacityGap,
    strengthTranslation,
    experienceExecution,
    timeToRaceRisk: tier ? { daysToRace, ...tier } : null,
  };
}
