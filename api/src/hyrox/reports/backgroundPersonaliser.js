const BACKGROUND_COPY = Object.freeze({
  // Current frontend keys
  new_to_strength: {
    aligned: "Even without a deep strength background, your station performance wasn't the limiting factor here — your running pattern is where the gap sits. This suggests aerobic durability under race conditions is the priority rather than strength volume. Build running consistency first, then revisit station-specific loading as your engine develops.",
    inverted: "You're newer to strength training, and HYROX's loaded stations — sled, sandbag, carries, and wall balls — are where a strengthening investment will pay the sharpest returns. Even a short consistent phase of progressively loaded work typically unlocks clear station-time improvements at your next race. The movements flagged in the focus areas below are a practical starting point.",
  },
  general_gym: {
    aligned: "General gym work appears to be supporting your station performance adequately — your data points to the running as the gap. A shift toward structured steady-state running at moderate intensity is typically the most effective lever for athletes in your position.",
    inverted: "A general gym background gives you a foundation for HYROX stations, but the data points to station execution as the gap. The highest-leverage change is typically specificity rather than volume: shifting sessions toward HYROX-weighted loading patterns — carries, sled-equivalent loading, wall ball pacing — transfers more directly than general strength work.",
  },
  crossfit_hybrid: {
    aligned: "CrossFit athletes often find station work is relatively comfortable in HYROX given the movement overlap — and your data supports this. The gap is in the running, which is less common. Sustained aerobic running at HYROX pace is a distinct demand from the short conditioning runs most CrossFit programming includes. Building a base of steady-state aerobic running at moderate intensity is typically the highest-leverage change here.",
    inverted: "CrossFit movement patterns translate well to HYROX station mechanics — the foundations of the loaded movements are already in your training. The gap for CrossFit athletes in HYROX typically isn't raw capacity but specificity: WOD-style training builds fitness across a broad range of demands, while HYROX rewards the ability to sustain station output at a specific pace across a 60–120 minute effort. Shifting some training time toward HYROX-specific loading (race-pace reps, exact competition weights) will sharpen this more efficiently than adding generic volume.",
  },
  strength_sport: {
    aligned: "Your strength background provides a direct foundation for HYROX's loaded stations — sled, sandbag, farmers carry, and wall balls all reward force production. The gap that strength-sport athletes typically encounter in HYROX is aerobic: maintaining output across 8 km of running while absorbing 8 stations takes a different energy system than a typical strength training block. The engine score from this race gives you the clearest signal of where that ceiling sits.",
    inverted: "Strength-sport athletes in HYROX typically find aerobic durability is the binding constraint — but your data suggests station performance is where the time is being lost. This sometimes points to a movement specificity gap rather than a strength gap: HYROX station weights are moderate but the demand is sustained under aerobic fatigue, which differs from a pure strength environment. Race-pace station rehearsal is likely more valuable here than adding heavier loading.",
  },
  // Legacy keys (kept for backward compat with stored athlete_context_json)
  running: {
    aligned: "Your running background gives you a structural advantage in the 8 km of running that runs through HYROX — aerobic durability and pacing under fatigue are typically strengths. The race data reflects a pattern common in runners: the gap sits in station capacity rather than the engine. Athletes from a running background often see the sharpest gains by redirecting one or two running sessions per week toward HYROX-specific loaded work — particularly the movements flagged in the focus areas below.",
    inverted: "Most runners find station strength is the bigger gap in HYROX, but your data points the other way — running is where the time is being lost. This is less common and worth investigating: pacing strategy under station fatigue, or a drop-off in later run splits, is often the cause rather than raw aerobic capacity. Your run fade profile below will indicate which.",
  },
  crossfit: {
    aligned: "CrossFit movement patterns translate well to HYROX station mechanics — the foundations of the loaded movements are already in your training. The gap for CrossFit athletes in HYROX typically isn't raw capacity but specificity: WOD-style training builds fitness across a broad range of demands, while HYROX rewards the ability to sustain station output at a specific pace across a 60–120 minute effort. Shifting some training time toward HYROX-specific loading (race-pace reps, exact competition weights) will sharpen this more efficiently than adding generic volume.",
    inverted: "CrossFit athletes often find station work is relatively comfortable in HYROX given the movement overlap — and your data supports this. The gap is in the running, which is less common. Sustained aerobic running at HYROX pace is a distinct demand from the short conditioning runs most CrossFit programming includes. Building a base of steady-state aerobic running at moderate intensity is typically the highest-leverage change here.",
  },
  strength_sports: {
    aligned: "Your strength background provides a direct foundation for HYROX's loaded stations — sled, sandbag, farmers carry, and wall balls all reward force production. The gap that strength-sport athletes typically encounter in HYROX is aerobic: maintaining output across 8 km of running while absorbing 8 stations takes a different energy system than a typical strength training block. The engine score from this race gives you the clearest signal of where that ceiling sits.",
    inverted: "Strength-sport athletes in HYROX typically find aerobic durability is the binding constraint — but your data suggests station performance is where the time is being lost. This sometimes points to a movement specificity gap rather than a strength gap: HYROX station weights are moderate but the demand is sustained under aerobic fatigue, which differs from a pure strength environment. Race-pace station rehearsal is likely more valuable here than adding heavier loading.",
  },
  team_sports: {
    aligned: "Team sport conditioning develops the explosiveness and short-burst capacity that helps with station output, but HYROX's 8 km of running — distributed across the race as sustained aerobic effort — requires a different energy system than most team sport training builds. A structured running base, emphasising moderate-intensity continuous work rather than interval work, is typically the highest-leverage aerobic investment for athletes from this background.",
    inverted: "Athletes from team sport backgrounds often find the running is the bigger HYROX gap, but your data points to station performance as the limiter. Your aerobic capacity appears to be supporting the running well — the focus area is the station-specific loaded work flagged in the recommendations below.",
  },
});

const RECOGNISED_BACKGROUNDS = Object.freeze(Object.keys(BACKGROUND_COPY));

export function buildBackgroundSection(analysisJson = {}, athleteContext = {}, contract = null) {
  const background = athleteContext.primaryBackground ?? null;
  if (!RECOGNISED_BACKGROUNDS.includes(background)) return null;

  const limiterKey = analysisJson.headline?.biggestLimiter?.segmentKey ?? null;
  const limiterType = analysisJson.headline?.biggestLimiter?.type ?? null;
  const hasStationBreakdownData = Array.isArray(analysisJson.stationBreakdown);
  const hasStationEvidence = (analysisJson.stationBreakdown ?? [])
    .some((s) => s.confidence !== "low" && s.timeGapSeconds > 0);
  const largestCategoryKey = contract?.gapReconciliation?.largestCategory?.key ?? null;
  const isRunLimiter = largestCategoryKey
    ? largestCategoryKey === "run_time"
    : limiterKey?.startsWith("run") || limiterKey === "run_time";
  const isStationLimiter = largestCategoryKey
    ? largestCategoryKey === "work_time"
    : limiterType === "station" || limiterKey === "work_time";
  const noLimiter = !isRunLimiter && !isStationLimiter;

  const aligned = background === "running" || background === "crossfit"
    ? isStationLimiter || noLimiter
    : isRunLimiter || noLimiter;

  if (hasStationBreakdownData && aligned && !hasStationEvidence && background === "running") {
    return "Without clear station split data, the training volume picture is the clearest signal available - focus there first.";
  }

  return BACKGROUND_COPY[background][aligned ? "aligned" : "inverted"];
}
