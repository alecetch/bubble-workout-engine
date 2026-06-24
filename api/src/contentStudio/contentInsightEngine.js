import { formatSeconds, interpolatePercentile, ordinal, stationLabel } from "./utils.js";

function hasFullSplits(a) {
  return Boolean(a?.narrativeStats?.hasFullSplits);
}

function hasRoxzoneSplits(a) {
  return Boolean(a?.narrativeStats?.hasRoxzoneSplits);
}

export function getFinishTimes(raceAnalysis) {
  return raceAnalysis.athletes
    .map((a) => a.finishTimeSeconds)
    .filter((t) => t != null && Number.isFinite(t))
    .sort((a, b) => a - b);
}


function gapStr(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function winningMarginLarge(raceAnalysis) {
  const times = getFinishTimes(raceAnalysis);
  if (times.length < 2) return null;
  const gap = times[1] - times[0];
  if (gap <= 90) return null;
  return {
    triggerKey: "winning_margin_large",
    headline: `Dominant victory — 2nd place was ${gapStr(gap)} back`,
    claim: `${formatSeconds(times[0])} winner, ${gapStr(gap)} ahead of 2nd place (${formatSeconds(times[1])})`,
    evidence: [`Winner: ${formatSeconds(times[0])}`, `2nd place: ${formatSeconds(times[1])}`, `Gap: ${gapStr(gap)}`],
    supportingMetrics: { gap, firstTime: times[0], secondTime: times[1], finishOnlyConfidence: 0.85 },
    athletesInvolved: [],
  };
}

export function winningMarginTight(raceAnalysis) {
  const times = getFinishTimes(raceAnalysis);
  if (times.length < 2) return null;
  const gap = times[1] - times[0];
  if (gap >= 30) return null;
  return {
    triggerKey: "winning_margin_tight",
    headline: `Incredibly close — only ${gapStr(gap)} between 1st and 2nd`,
    claim: `${formatSeconds(times[0])} vs ${formatSeconds(times[1])} — separated by just ${gapStr(gap)}`,
    evidence: [`Winner: ${formatSeconds(times[0])}`, `2nd place: ${formatSeconds(times[1])}`, `Gap: ${gapStr(gap)}`],
    supportingMetrics: { gap, firstTime: times[0], secondTime: times[1], finishOnlyConfidence: 0.9 },
    athletesInvolved: [],
  };
}

export function closePodium(raceAnalysis) {
  const times = getFinishTimes(raceAnalysis);
  if (times.length < 3) return null;
  const gap = times[2] - times[0];
  if (gap >= 90) return null;
  return {
    triggerKey: "close_podium",
    headline: `The entire podium finished within ${gapStr(gap)}`,
    claim: `1st to 3rd covered in ${gapStr(gap)}: ${formatSeconds(times[0])}, ${formatSeconds(times[1])}, ${formatSeconds(times[2])}`,
    evidence: [`1st: ${formatSeconds(times[0])}`, `2nd: ${formatSeconds(times[1])}`, `3rd: ${formatSeconds(times[2])}`, `Total podium gap: ${gapStr(gap)}`],
    supportingMetrics: { gap, firstTime: times[0], secondTime: times[1], thirdTime: times[2], finishOnlyConfidence: 0.85 },
    athletesInvolved: [],
  };
}

export function fieldCompression(raceAnalysis) {
  const times = getFinishTimes(raceAnalysis);
  if (times.length < 10) return null;
  const gap = times[9] - times[0];
  if (gap >= 300) return null;
  return {
    triggerKey: "field_compression",
    headline: `Compressed field — top 10 separated by just ${gapStr(gap)}`,
    claim: `1st place (${formatSeconds(times[0])}) to 10th place (${formatSeconds(times[9])}) covers only ${gapStr(gap)}`,
    evidence: [`1st: ${formatSeconds(times[0])}`, `10th: ${formatSeconds(times[9])}`, `Gap: ${gapStr(gap)}`],
    supportingMetrics: { gap, firstTime: times[0], tenthTime: times[9], finishOnlyConfidence: 0.8 },
    athletesInvolved: [],
  };
}

export function dominantWinner(raceAnalysis) {
  const times = getFinishTimes(raceAnalysis);
  if (times.length < 5) return null;
  // Compare winner against top-20 median (or all if fewer) to avoid inflating the gap
  // with slower athletes at the back of a 50-person field
  const comparison = times.slice(0, Math.min(20, times.length));
  const median = comparison[Math.floor(comparison.length / 2)];
  const ratio = times[0] / median;
  if (ratio >= 0.92) return null;
  const pct = Math.round((1 - ratio) * 100);
  return {
    triggerKey: "dominant_winner",
    headline: `The winner was ${pct}% faster than the top-20 median`,
    claim: `${formatSeconds(times[0])} winner vs ${formatSeconds(median)} top-20 median — a ${pct}% advantage`,
    evidence: [`Winner: ${formatSeconds(times[0])}`, `Top-20 median: ${formatSeconds(median)}`, `Advantage: ${pct}%`],
    supportingMetrics: { winnerTime: times[0], top20Median: median, ratio, finishOnlyConfidence: 0.8 },
    athletesInvolved: [],
  };
}

export function roxzoneDecisive(raceAnalysis) {
  if (!hasRoxzoneSplits(raceAnalysis)) return null;
  const r = raceAnalysis.raceStats.rankCorrelations.roxzone_total;
  if (r == null || r < 0.6) return null;
  return {
    triggerKey: "roxzone_decisive",
    headline: "Transitions decided this race",
    claim: `Roxzone rank was ${(r * 100).toFixed(0)}% correlated with finish position - athletes who moved faster through transitions finished higher`,
    evidence: [`Roxzone rank correlation: ${r.toFixed(2)}`, "(1.0 = perfectly predictive)"],
    supportingMetrics: { roxzoneCorrelation: r },
    athletesInvolved: [],
  };
}

export function winnerFastestTransitions(raceAnalysis) {
  if (!hasRoxzoneSplits(raceAnalysis)) return null;
  const w = raceAnalysis.athletes[0];
  if (!w || w.roxzoneRank == null || w.roxzoneRank !== 1) return null;
  const second = raceAnalysis.athletes[1];
  const gap = second?.roxzoneTotalFromSplits != null && w.roxzoneTotalFromSplits != null
    ? second.roxzoneTotalFromSplits - w.roxzoneTotalFromSplits
    : null;
  return {
    triggerKey: "winner_fastest_transitions",
    headline: "The winner was also the fastest through transitions",
    claim: `${w.name} won and had the lowest total roxzone time${gap != null ? ` - ${formatSeconds(gap)} faster in transitions than 2nd place` : ""}`,
    evidence: [
      `Winner roxzone: ${formatSeconds(w.roxzoneTotalFromSplits)}`,
      ...(second?.roxzoneTotalFromSplits != null ? [`2nd place roxzone: ${formatSeconds(second.roxzoneTotalFromSplits)}`] : []),
      ...(gap != null ? [`Transition gap: ${formatSeconds(gap)}`] : []),
    ],
    supportingMetrics: { winnerRoxzoneRank: 1, winnerRoxzone: w.roxzoneTotalFromSplits, transitionGap: gap },
    athletesInvolved: [w.name],
  };
}

export function winnerDespiteSlowTransitions(raceAnalysis) {
  if (!hasRoxzoneSplits(raceAnalysis)) return null;
  const w = raceAnalysis.athletes[0];
  if (!w || w.roxzoneRank == null || w.roxzoneRank < 4) return null;
  const medianRoxzone = raceAnalysis.raceStats.segments.roxzone_total?.median;
  return {
    triggerKey: "winner_despite_slow_transitions",
    headline: "The winner won despite slow transitions",
    claim: `${w.name} ranked ${w.roxzoneRank}${ordinal(w.roxzoneRank)} in transitions but still won - their station and run pace was too fast to catch`,
    evidence: [
      `Winner roxzone rank: ${w.roxzoneRank}${ordinal(w.roxzoneRank)}`,
      `Winner roxzone total: ${formatSeconds(w.roxzoneTotalFromSplits)}`,
      ...(medianRoxzone != null ? [`Field median roxzone: ${formatSeconds(Math.round(medianRoxzone))}`] : []),
    ],
    supportingMetrics: { winnerRoxzoneRank: w.roxzoneRank, winnerRoxzone: w.roxzoneTotalFromSplits, medianRoxzone },
    athletesInvolved: [w.name],
  };
}

export function transitionTimeMattersTrigger(raceAnalysis) {
  if (!hasRoxzoneSplits(raceAnalysis) || raceAnalysis.athletes.length < 3) return null;
  const medianRoxzone = raceAnalysis.raceStats.segments.roxzone_total?.median;
  if (medianRoxzone == null) return null;
  const podium = raceAnalysis.athletes.slice(0, 3);
  if (!podium.every((a) => a.roxzoneTotalFromSplits != null && a.roxzoneTotalFromSplits < medianRoxzone)) return null;
  return {
    triggerKey: "transition_time_matters",
    headline: "All 3 podium athletes had below-median transition times",
    claim: "The podium was faster than the field in both performance and transitions - not a coincidence",
    evidence: podium.map((a, i) => `${["1st", "2nd", "3rd"][i]} roxzone: ${formatSeconds(a.roxzoneTotalFromSplits)}`)
      .concat([`Field median: ${formatSeconds(Math.round(medianRoxzone))}`]),
    supportingMetrics: { podiumRoxzones: podium.map((a) => a.roxzoneTotalFromSplits), fieldMedianRoxzone: medianRoxzone },
    athletesInvolved: podium.map((a) => a.name),
  };
}

export function oneStationCostsRace(raceAnalysis) {
  if (!hasRoxzoneSplits(raceAnalysis)) return null;
  const stationKeys = ["skierg", "sled_push", "sled_pull", "burpee_bj", "row", "farmers_carry", "sandbag_lunge", "wall_balls"];
  const topTen = raceAnalysis.athletes.slice(0, 10);
  for (const athlete of topTen) {
    for (const stationKey of stationKeys) {
      const inVal = athlete.roxzoneSplits?.[`${stationKey}_rox_in`];
      const outVal = athlete.roxzoneSplits?.[`${stationKey}_rox_out`];
      if (inVal == null || outVal == null) continue;
      const athleteStationRox = inVal + outVal;
      const fieldMedianForStation = raceAnalysis.raceStats.segments[`${stationKey}_rox_total`]?.median;
      if (fieldMedianForStation == null || fieldMedianForStation <= 0) continue;
      if (athleteStationRox > fieldMedianForStation * 2) {
        const roundedMedian = Math.round(fieldMedianForStation);
        const overage = athleteStationRox - roundedMedian;
        return {
          triggerKey: "one_station_costs_the_race",
          headline: `A single transition may have cost ${athlete.name} places`,
          claim: `${athlete.name} (${athlete.rank}${ordinal(athlete.rank)} overall) spent ${formatSeconds(athleteStationRox)} at the ${stationLabel(stationKey)} transition - ${formatSeconds(overage)} more than the field median`,
          evidence: [
            `${stationLabel(stationKey)} transition: ${formatSeconds(athleteStationRox)}`,
            `Field median: ${formatSeconds(roundedMedian)}`,
            `Overage: ${formatSeconds(overage)}`,
          ],
          supportingMetrics: { station: stationKey, athleteRox: athleteStationRox, fieldMedian: fieldMedianForStation, overage },
          athletesInvolved: [athlete.name],
        };
      }
    }
  }
  return null;
}

export const TRIGGERS = {
  winning_margin_large: winningMarginLarge,
  winning_margin_tight: winningMarginTight,
  close_podium: closePodium,
  field_compression: fieldCompression,
  dominant_winner: dominantWinner,

  winner_not_strongest_station: (a) => {
    if (!hasFullSplits(a)) return null;
    const w = a.athletes[0];
    if (w.stationRank == null || w.stationRank <= 2) return null;
    return {
      headline: "The winner wasn't the strongest station athlete",
      claim: `${w.name} won overall but ranked ${w.stationRank}${ordinal(w.stationRank)} on station work`,
      evidence: [
        "Overall rank: 1st",
        `Station rank: ${w.stationRank}${ordinal(w.stationRank)}`,
        `Run total advantage: +${formatSeconds(a.athletes[1].runTotalSeconds - w.runTotalSeconds)}`,
      ],
      supportingMetrics: { stationRank: w.stationRank, runRank: w.runRank },
      athletesInvolved: [w.name],
    };
  },
  winner_not_fastest_runner: (a) => {
    if (!hasFullSplits(a)) return null;
    const w = a.athletes[0];
    if (w.runRank == null || w.runRank === 1) return null;
    return {
      headline: "The fastest runner didn't win",
      claim: `${w.name} won but wasn't the fastest runner (ranked ${w.runRank}${ordinal(w.runRank)} on running)`,
      evidence: [`Winner run rank: ${w.runRank}${ordinal(w.runRank)}`, `Winner station rank: ${w.stationRank}${ordinal(w.stationRank)}`],
      supportingMetrics: { runRank: w.runRank, stationRank: w.stationRank },
      athletesInvolved: [w.name],
    };
  },
  most_consistent_won: (a) => {
    if (!hasFullSplits(a)) return null;
    const athletes = a.athletes.filter((ath) => ath.splitVariance != null).slice(0, 5);
    if (athletes.length < 3) return null;
    const winnerVariance = athletes[0].splitVariance;
    if (!athletes.slice(1).every((ath) => ath.splitVariance > winnerVariance)) return null;
    return { headline: "The most consistent athlete won", claim: "The winner had the lowest split variance in the top 5", evidence: [`Winner split CV: ${(winnerVariance * 100).toFixed(1)}%`], supportingMetrics: { winnerSplitCV: winnerVariance }, athletesInvolved: [athletes[0].name] };
  },
  sled_decides_race: (a) => {
    if (!hasFullSplits(a)) return null;
    const r = a.raceStats.rankCorrelations.combined_sled;
    if (r == null || r < 0.65) return null;
    return { headline: "Sleds decided this race", claim: `Sled push + pull combined rank correlated ${(r * 100).toFixed(0)}% with finish position`, evidence: [`Sled rank correlation: ${r.toFixed(2)}`, "(1.0 = perfectly predictive)"], supportingMetrics: { sledCorrelation: r }, athletesInvolved: [] };
  },
  wall_balls_decide_race: (a) => {
    if (!hasFullSplits(a)) return null;
    const r = a.raceStats.rankCorrelations.wall_balls;
    if (r == null || r < 0.65) return null;
    return { headline: "Wall balls were decisive in this race", claim: `Wall ball rank correlated ${(r * 100).toFixed(0)}% with finish position`, evidence: [`Wall ball rank correlation: ${r.toFixed(2)}`], supportingMetrics: { wallBallCorrelation: r }, athletesInvolved: [] };
  },
  running_decides_race: (a) => {
    if (!hasFullSplits(a)) return null;
    const r = a.raceStats.rankCorrelations.run_total;
    if (r == null || r < 0.7) return null;
    return { headline: "This race was decided by running", claim: `Run total rank correlated ${(r * 100).toFixed(0)}% with finish position - higher than any single station`, evidence: [`Run correlation: ${r.toFixed(2)}`, `Most decisive station: ${a.narrativeStats.mostDecisiveStation} (${(a.raceStats.rankCorrelations[a.narrativeStats.mostDecisiveStation] || 0).toFixed(2)})`], supportingMetrics: { runCorrelation: r }, athletesInvolved: [] };
  },
  most_decisive_station: (a) => {
    if (!hasFullSplits(a)) return null;
    const station = a.narrativeStats.mostDecisiveStation;
    const r = a.raceStats.rankCorrelations[station];
    if (!station || r == null || r < 0.55) return null;
    return { headline: `${stationLabel(station)} was the most decisive station`, claim: `${stationLabel(station)} rank correlated ${(r * 100).toFixed(0)}% with finish position`, evidence: [`Rank correlation: ${r.toFixed(2)}`], supportingMetrics: { station, correlation: r }, athletesInvolved: [] };
  },
  most_variable_station: (a) => {
    if (!hasFullSplits(a)) return null;
    const station = a.narrativeStats.mostVariableStation;
    const stats = a.raceStats.segments[station];
    if (!station || !stats) return null;
    return { headline: `${stationLabel(station)} split the field`, claim: `${stationLabel(station)} had the highest time spread in this race`, evidence: [`Fastest: ${formatSeconds(stats.min)}`, `Slowest: ${formatSeconds(stats.max)}`, `Gap: ${formatSeconds(stats.max - stats.min)}`], supportingMetrics: { station, cv: stats.cv, spread: stats.max - stats.min }, athletesInvolved: [] };
  },
  winner_historic_percentile: (a) => {
    const w = a.athletes[0];
    const bench = a.historicalBenchmarks?.finish_time;
    if (!bench) return null;
    const pct = interpolatePercentile(w.finishTimeSeconds, bench);
    if (pct == null || pct > 10) return null;
    return { headline: `The winner's time was in the top ${pct}% historically`, claim: `${w.name}'s finish time of ${formatSeconds(w.finishTimeSeconds)} ranks in the top ${pct}% of all comparable HYROX results`, evidence: [`Finish time: ${formatSeconds(w.finishTimeSeconds)}`, `Historical top ${pct}%`], supportingMetrics: { historicalPercentile: pct }, athletesInvolved: [w.name] };
  },
  winner_station_historic: (a) => {
    if (!hasFullSplits(a)) return null;
    const w = a.athletes[0];
    const bestStation = Object.entries(w.splits).filter(([k, v]) => v != null && !k.startsWith("run_")).sort(([, av], [, bv]) => av - bv)[0];
    if (!bestStation) return null;
    const bench = a.historicalBenchmarks?.[bestStation[0]];
    if (!bench) return null;
    const pct = interpolatePercentile(bestStation[1], bench);
    if (pct == null || pct > 5) return null;
    return { headline: `${w.name}'s ${stationLabel(bestStation[0])} was historically elite`, claim: `That split was in the top ${pct}% of all comparable HYROX performances`, evidence: [`${stationLabel(bestStation[0])}: ${formatSeconds(bestStation[1])}`, `Historical top ${pct}%`], supportingMetrics: { station: bestStation[0], historicalPercentile: pct }, athletesInvolved: [w.name] };
  },
  podium_run_pace: (a) => {
    if (!hasFullSplits(a) || a.athletes.length < 3) return null;
    const podiumRuns = a.athletes.slice(0, 3).map((ath) => ath.runTotalSeconds).filter(Number.isFinite);
    if (podiumRuns.length < 3) return null;
    const podiumAvgRun = podiumRuns.reduce((s, value) => s + value, 0) / 3;
    const bench = a.historicalBenchmarks?.run_total;
    if (!bench) return null;
    const pct = interpolatePercentile(podiumAvgRun, bench);
    if (pct == null || pct > 20) return null;
    return { headline: "The podium ran at a historically exceptional pace", claim: `Average podium run time was in the top ${pct}% historically`, evidence: [`Average podium run: ${formatSeconds(Math.round(podiumAvgRun))}`, `Historical top ${pct}%`], supportingMetrics: { podiumAvgRunSeconds: Math.round(podiumAvgRun), historicalPercentile: pct }, athletesInvolved: a.athletes.slice(0, 3).map((ath) => ath.name) };
  },
  field_quality: (a) => {
    const medianFinish = a.raceStats.segments.finish_time?.median;
    const bench = a.historicalBenchmarks?.finish_time;
    if (!medianFinish || !bench) return null;
    const pct = interpolatePercentile(medianFinish, bench);
    if (pct == null || pct > 30) return null;
    return { headline: "This was a historically fast field", claim: `Median finish time was in the top ${pct}% of all comparable HYROX races`, evidence: [`Field median: ${formatSeconds(Math.round(medianFinish))}`, `Historical top ${pct}%`], supportingMetrics: { medianFinishSeconds: Math.round(medianFinish), historicalPercentile: pct }, athletesInvolved: [] };
  },
  myth_sleds_decide: (a) => {
    if (!hasFullSplits(a)) return null;
    const sled = a.raceStats.rankCorrelations.combined_sled ?? 0;
    const run = a.raceStats.rankCorrelations.run_total ?? 0;
    // Require run to be meaningfully predictive before claiming it beats sleds
    if (sled > 0.45 || run < 0.5 || run <= sled) return null;
    return { headline: 'MYTH BUSTED: "HYROX is won on the sleds"', claim: "In this race, running was more predictive of finish position than sleds", evidence: [`Sled rank correlation: ${sled.toFixed(2)}`, `Run rank correlation: ${run.toFixed(2)}`, "(1.0 = perfectly predictive)"], supportingMetrics: { sledCorrelation: sled, runCorrelation: run }, athletesInvolved: [] };
  },
  myth_wallballs_decide: (a) => {
    if (!hasFullSplits(a)) return null;
    const wb = a.raceStats.rankCorrelations.wall_balls ?? 0;
    const run = a.raceStats.rankCorrelations.run_total ?? 0;
    // Require run to be meaningfully predictive before claiming it beats wall balls
    if (wb > 0.45 || run < 0.5 || run <= wb) return null;
    return { headline: 'MYTH BUSTED: "Wall balls decide races"', claim: "In this race, wall balls were not the most predictive factor for finish position", evidence: [`Wall ball correlation: ${wb.toFixed(2)}`, `Run correlation: ${run.toFixed(2)}`, "(1.0 = perfectly predictive)"], supportingMetrics: { wallBallCorrelation: wb, runCorrelation: run }, athletesInvolved: [] };
  },
  myth_running_doesnt_matter: (a) => {
    if (!hasFullSplits(a)) return null;
    const run = a.raceStats.rankCorrelations.run_total ?? 0;
    if (run < 0.6) return null;
    return { headline: 'MYTH BUSTED: "Running doesn\'t matter in HYROX"', claim: `Run total was ${(run * 100).toFixed(0)}% correlated with finish position in this race`, evidence: [`Run rank correlation: ${run.toFixed(2)}`, "(1.0 = perfectly predictive)"], supportingMetrics: { runCorrelation: run }, athletesInvolved: [] };
  },
  myth_stations_decide: (a) => {
    if (!hasFullSplits(a)) return null;
    const station = a.raceStats.rankCorrelations.station_total ?? 0;
    const run = a.raceStats.rankCorrelations.run_total ?? 0;
    // Require both to be meaningful so we're not just comparing two noise values
    if (run < 0.5 || station > run) return null;
    return { headline: "Running mattered more than stations in this race", claim: `Run total (${(run * 100).toFixed(0)}% correlated) outpredicted station total (${(station * 100).toFixed(0)}%) for finish position`, evidence: [`Run correlation: ${run.toFixed(2)}`, `Station correlation: ${station.toFixed(2)}`, "(1.0 = perfectly predictive)"], supportingMetrics: { runCorrelation: run, stationCorrelation: station }, athletesInvolved: [] };
  },

  roxzone_decisive: roxzoneDecisive,
  winner_fastest_transitions: winnerFastestTransitions,
  winner_despite_slow_transitions: winnerDespiteSlowTransitions,
  transition_time_matters: transitionTimeMattersTrigger,
  one_station_costs_the_race: oneStationCostsRace,
};

function normaliseTriggeredResult(type, result) {
  // All triggers now return a uniform shape; triggerKey field is no longer used as a branch signal.
  return { type, ...result };
}

export function scoreInsight(type, triggeredResult, raceAnalysis) {
  const n = raceAnalysis.athletes.length;
  const sampleConf = n >= 20 ? 0.7 : n >= 10 ? 0.5 : 0.3;
  const corrBoost = Math.abs(triggeredResult.supportingMetrics.correlation ?? triggeredResult.supportingMetrics.runCorrelation ?? triggeredResult.supportingMetrics.roxzoneCorrelation ?? 0) > 0.7 ? 0.2 : 0;
  const histBoost = triggeredResult.supportingMetrics.historicalPercentile != null ? 0.1 : 0;
  const finishBoost = triggeredResult.supportingMetrics.finishOnlyConfidence != null ? 0.15 : 0;
  const confidenceScore = Math.min(1, sampleConf + corrBoost + histBoost + finishBoost);
  const noveltyBase = type.startsWith("myth_") ? 0.7 : type.includes("not_") ? 0.65 : type.includes("roxzone") || type.includes("transition") ? 0.6 : type.includes("margin") || type.includes("compression") ? 0.55 : 0.4;
  const histNovelty = triggeredResult.supportingMetrics.historicalPercentile != null && triggeredResult.supportingMetrics.historicalPercentile <= 5 ? 0.2 : 0;
  const noveltyScore = Math.min(1, noveltyBase + histNovelty);
  const educationalMap = {
    myth_sleds_decide: 0.9, myth_wallballs_decide: 0.9, myth_running_doesnt_matter: 0.9,
    running_decides_race: 0.8, most_decisive_station: 0.8, what_we_learn: 0.9,
    winner_not_strongest_station: 0.7, winner_not_fastest_runner: 0.7,
    most_consistent_won: 0.8, most_variable_station: 0.6,
    winner_historic_percentile: 0.5, field_quality: 0.5,
    winning_margin_large: 0.55, winning_margin_tight: 0.55, close_podium: 0.55,
    field_compression: 0.6, dominant_winner: 0.6,
    roxzone_decisive: 0.8, winner_fastest_transitions: 0.65,
    winner_despite_slow_transitions: 0.7, transition_time_matters: 0.75,
    one_station_costs_the_race: 0.7,
  };
  const educationalValue = educationalMap[type] ?? 0.5;
  const namedAthletes = triggeredResult.athletesInvolved.length > 0 ? 0.2 : 0;
  const shareabilityScore = Math.min(1, noveltyScore * 0.5 + confidenceScore * 0.3 + namedAthletes);
  const namedRisk = triggeredResult.athletesInvolved.length > 0 && type.includes("weakness") ? 0.4 : 0;
  const riskScore = namedRisk;
  const compositeScore = confidenceScore * 0.25 + noveltyScore * 0.25 + educationalValue * 0.2 + shareabilityScore * 0.2 + (1 - riskScore) * 0.1;
  return { confidenceScore, noveltyScore, educationalValue, shareabilityScore, athleteRelevance: namedAthletes > 0 ? 0.7 : 0.3, riskScore, compositeScore };
}

export function generateContentInsights(raceAnalysis) {
  return Object.entries(TRIGGERS)
    .map(([type, trigger]) => {
      const result = trigger(raceAnalysis);
      if (!result) return null;
      const normalised = normaliseTriggeredResult(type, result);
      return { ...normalised, scores: scoreInsight(type, normalised, raceAnalysis) };
    })
    .filter(Boolean)
    .sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);
}
