import { formatSeconds, interpolatePercentile, ordinal, stationLabel } from "./utils.js";

export const TRIGGERS = {
  winner_not_strongest_station: (a) => {
    if (a.athletes[0].stationRank <= 2) return null;
    const w = a.athletes[0];
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
    if (a.athletes[0].runRank === 1) return null;
    const w = a.athletes[0];
    return {
      headline: "The fastest runner didn't win",
      claim: `${w.name} won but wasn't the fastest runner (ranked ${w.runRank}${ordinal(w.runRank)} on running)`,
      evidence: [`Winner run rank: ${w.runRank}${ordinal(w.runRank)}`, `Winner station rank: ${w.stationRank}${ordinal(w.stationRank)}`],
      supportingMetrics: { runRank: w.runRank, stationRank: w.stationRank },
      athletesInvolved: [w.name],
    };
  },
  most_consistent_won: (a) => {
    const athletes = a.athletes.filter((ath) => ath.splitVariance != null).slice(0, 5);
    if (athletes.length < 3) return null;
    const winnerVariance = athletes[0].splitVariance;
    if (!athletes.slice(1).every((ath) => ath.splitVariance > winnerVariance)) return null;
    return {
      headline: "The most consistent athlete won",
      claim: "The winner had the lowest split variance in the top 5",
      evidence: [`Winner split CV: ${(winnerVariance * 100).toFixed(1)}%`],
      supportingMetrics: { winnerSplitCV: winnerVariance },
      athletesInvolved: [athletes[0].name],
    };
  },
  sled_decides_race: (a) => {
    const r = a.raceStats.rankCorrelations.combined_sled;
    if (r == null || r < 0.65) return null;
    return { headline: "Sleds decided this race", claim: `Sled push + pull combined rank correlated ${(r * 100).toFixed(0)}% with finish position`, evidence: [`Sled rank correlation: ${r.toFixed(2)}`, "(1.0 = perfectly predictive)"], supportingMetrics: { sledCorrelation: r }, athletesInvolved: [] };
  },
  wall_balls_decide_race: (a) => {
    const r = a.raceStats.rankCorrelations.wall_balls;
    if (r == null || r < 0.65) return null;
    return { headline: "Wall balls were decisive in this race", claim: `Wall ball rank correlated ${(r * 100).toFixed(0)}% with finish position`, evidence: [`Wall ball rank correlation: ${r.toFixed(2)}`], supportingMetrics: { wallBallCorrelation: r }, athletesInvolved: [] };
  },
  running_decides_race: (a) => {
    const r = a.raceStats.rankCorrelations.run_total;
    if (r == null || r < 0.7) return null;
    return { headline: "This race was decided by running", claim: `Run total rank correlated ${(r * 100).toFixed(0)}% with finish position - higher than any single station`, evidence: [`Run correlation: ${r.toFixed(2)}`, `Most decisive station: ${a.narrativeStats.mostDecisiveStation} (${(a.raceStats.rankCorrelations[a.narrativeStats.mostDecisiveStation] || 0).toFixed(2)})`], supportingMetrics: { runCorrelation: r }, athletesInvolved: [] };
  },
  most_decisive_station: (a) => {
    const station = a.narrativeStats.mostDecisiveStation;
    const r = a.raceStats.rankCorrelations[station];
    if (!station || r == null || r < 0.55) return null;
    return { headline: `${stationLabel(station)} was the most decisive station`, claim: `${stationLabel(station)} rank correlated ${(r * 100).toFixed(0)}% with finish position`, evidence: [`Rank correlation: ${r.toFixed(2)}`], supportingMetrics: { station, correlation: r }, athletesInvolved: [] };
  },
  most_variable_station: (a) => {
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
    if (a.athletes.length < 3) return null;
    const podiumAvgRun = a.athletes.slice(0, 3).filter((ath) => ath.runTotalSeconds).reduce((s, ath) => s + ath.runTotalSeconds, 0) / 3;
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
    const sled = a.raceStats.rankCorrelations.combined_sled ?? 0;
    const run = a.raceStats.rankCorrelations.run_total ?? 0;
    if (sled > 0.45 || run <= sled) return null;
    return { headline: 'MYTH BUSTED: "HYROX is won on the sleds"', claim: "In this race, running was more predictive of finish position than sleds", evidence: [`Sled rank correlation: ${sled.toFixed(2)}`, `Run rank correlation: ${run.toFixed(2)}`], supportingMetrics: { sledCorrelation: sled, runCorrelation: run }, athletesInvolved: [] };
  },
  myth_wallballs_decide: (a) => {
    const wb = a.raceStats.rankCorrelations.wall_balls ?? 0;
    const run = a.raceStats.rankCorrelations.run_total ?? 0;
    if (wb > 0.45 || run <= wb) return null;
    return { headline: 'MYTH BUSTED: "Wall balls decide races"', claim: "In this race, wall balls were not the most predictive factor for finish position", evidence: [`Wall ball correlation: ${wb.toFixed(2)}`, `Run correlation: ${run.toFixed(2)}`], supportingMetrics: { wallBallCorrelation: wb, runCorrelation: run }, athletesInvolved: [] };
  },
  myth_running_doesnt_matter: (a) => {
    const run = a.raceStats.rankCorrelations.run_total ?? 0;
    if (run < 0.6) return null;
    return { headline: 'MYTH BUSTED: "Running doesn\'t matter in HYROX"', claim: `Run total was ${(run * 100).toFixed(0)}% correlated with finish position in this race`, evidence: [`Run rank correlation: ${run.toFixed(2)}`, "(1.0 = perfectly predictive)"], supportingMetrics: { runCorrelation: run }, athletesInvolved: [] };
  },
  myth_stations_decide: (a) => {
    const station = a.raceStats.rankCorrelations.station_total ?? 0;
    const run = a.raceStats.rankCorrelations.run_total ?? 0;
    if (station > run) return null;
    return { headline: "Running mattered more than stations in this race", claim: `Run total (${(run * 100).toFixed(0)}% correlated) outpredicted station total (${(station * 100).toFixed(0)}%) for finish position`, evidence: [`Run correlation: ${run.toFixed(2)}`, `Station correlation: ${station.toFixed(2)}`], supportingMetrics: { runCorrelation: run, stationCorrelation: station }, athletesInvolved: [] };
  },
};

export function scoreInsight(type, triggeredResult, raceAnalysis) {
  const n = raceAnalysis.athletes.length;
  const sampleConf = n >= 20 ? 0.7 : n >= 10 ? 0.5 : 0.3;
  const corrBoost = Math.abs(triggeredResult.supportingMetrics.correlation ?? triggeredResult.supportingMetrics.runCorrelation ?? 0) > 0.7 ? 0.2 : 0;
  const histBoost = triggeredResult.supportingMetrics.historicalPercentile != null ? 0.1 : 0;
  const confidenceScore = Math.min(1, sampleConf + corrBoost + histBoost);
  const noveltyBase = type.startsWith("myth_") ? 0.7 : type.includes("not_") ? 0.65 : 0.4;
  const histNovelty = triggeredResult.supportingMetrics.historicalPercentile != null && triggeredResult.supportingMetrics.historicalPercentile <= 5 ? 0.2 : 0;
  const noveltyScore = Math.min(1, noveltyBase + histNovelty);
  const educationalMap = {
    myth_sleds_decide: 0.9, myth_wallballs_decide: 0.9, myth_running_doesnt_matter: 0.9,
    running_decides_race: 0.8, most_decisive_station: 0.8, what_we_learn: 0.9,
    winner_not_strongest_station: 0.7, winner_not_fastest_runner: 0.7,
    most_consistent_won: 0.8, most_variable_station: 0.6,
    winner_historic_percentile: 0.5, field_quality: 0.5,
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
      return { type, ...result, scores: scoreInsight(type, result, raceAnalysis) };
    })
    .filter(Boolean)
    .sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);
}
