import test from "node:test";
import assert from "node:assert/strict";
import {
  roxzoneDecisive,
  winnerFastestTransitions,
  winnerDespiteSlowTransitions,
  transitionTimeMattersTrigger,
  oneStationCostsRace,
} from "../src/contentStudio/contentInsightEngine.js";

function makeAnalysis({ roxzoneCorrelation = 0, athletes = [], medianRoxzone = null, hasRoxzoneSplits = true } = {}) {
  return {
    athletes,
    raceStats: {
      segments: {
        roxzone_total: { median: medianRoxzone },
        skierg_rox_total: { median: 10 },
      },
      rankCorrelations: { roxzone_total: roxzoneCorrelation },
    },
    narrativeStats: { hasRoxzoneSplits, hasFullSplits: true },
    historicalBenchmarks: {},
  };
}

function makeAthlete(overrides = {}) {
  return {
    name: "Athlete",
    rank: 1,
    finishTimeSeconds: 3600,
    splits: {},
    roxzoneSplits: {},
    roxzoneTotalFromSplits: 200,
    roxzoneRank: 1,
    ...overrides,
  };
}

test("roxzoneDecisive fires when correlation >= 0.60 and hasRoxzoneSplits", () => {
  const a = makeAnalysis({ roxzoneCorrelation: 0.72, athletes: [makeAthlete()], hasRoxzoneSplits: true });
  assert.equal(roxzoneDecisive(a)?.triggerKey, "roxzone_decisive");
});

test("roxzoneDecisive returns null when hasRoxzoneSplits is false", () => {
  const a = makeAnalysis({ roxzoneCorrelation: 0.72, athletes: [makeAthlete()], hasRoxzoneSplits: false });
  assert.equal(roxzoneDecisive(a), null);
});

test("roxzoneDecisive returns null when correlation < 0.60", () => {
  const a = makeAnalysis({ roxzoneCorrelation: 0.55, athletes: [makeAthlete()], hasRoxzoneSplits: true });
  assert.equal(roxzoneDecisive(a), null);
});

test("winnerFastestTransitions fires when winner roxzoneRank === 1", () => {
  const a = makeAnalysis({
    hasRoxzoneSplits: true,
    athletes: [makeAthlete({ roxzoneRank: 1, roxzoneTotalFromSplits: 150 }), makeAthlete({ rank: 2, roxzoneRank: 2, roxzoneTotalFromSplits: 180 })],
  });
  assert.equal(winnerFastestTransitions(a)?.triggerKey, "winner_fastest_transitions");
});

test("winnerFastestTransitions returns null when winner roxzoneRank > 1", () => {
  const a = makeAnalysis({ hasRoxzoneSplits: true, athletes: [makeAthlete({ roxzoneRank: 2 }), makeAthlete({ rank: 2, roxzoneRank: 1 })] });
  assert.equal(winnerFastestTransitions(a), null);
});

test("winnerDespiteSlowTransitions fires when winner roxzoneRank >= 4", () => {
  const a = makeAnalysis({ hasRoxzoneSplits: true, medianRoxzone: 200, athletes: [makeAthlete({ roxzoneRank: 5, roxzoneTotalFromSplits: 280 })] });
  assert.equal(winnerDespiteSlowTransitions(a)?.triggerKey, "winner_despite_slow_transitions");
});

test("winnerDespiteSlowTransitions returns null when roxzoneRank < 4", () => {
  const a = makeAnalysis({ hasRoxzoneSplits: true, athletes: [makeAthlete({ roxzoneRank: 3 })] });
  assert.equal(winnerDespiteSlowTransitions(a), null);
});

test("transitionTimeMattersTrigger fires when all 3 podium are below median roxzone", () => {
  const a = makeAnalysis({
    hasRoxzoneSplits: true,
    medianRoxzone: 250,
    athletes: [
      makeAthlete({ rank: 1, roxzoneTotalFromSplits: 150 }),
      makeAthlete({ rank: 2, roxzoneTotalFromSplits: 180 }),
      makeAthlete({ rank: 3, roxzoneTotalFromSplits: 200 }),
    ],
  });
  assert.equal(transitionTimeMattersTrigger(a)?.triggerKey, "transition_time_matters");
});

test("transitionTimeMattersTrigger returns null when 3rd place is above median", () => {
  const a = makeAnalysis({
    hasRoxzoneSplits: true,
    medianRoxzone: 250,
    athletes: [
      makeAthlete({ rank: 1, roxzoneTotalFromSplits: 150 }),
      makeAthlete({ rank: 2, roxzoneTotalFromSplits: 180 }),
      makeAthlete({ rank: 3, roxzoneTotalFromSplits: 260 }),
    ],
  });
  assert.equal(transitionTimeMattersTrigger(a), null);
});

test("oneStationCostsRace fires when top-10 athlete has station rox > 2x field median", () => {
  const athlete = makeAthlete({
    rank: 3,
    roxzoneSplits: { skierg_rox_in: 30, skierg_rox_out: 25 },
  });
  const a = {
    athletes: [makeAthlete({ rank: 1 }), makeAthlete({ rank: 2 }), athlete],
    raceStats: {
      segments: { roxzone_total: { median: 200 }, skierg_rox_total: { median: 12 } },
      rankCorrelations: {},
    },
    narrativeStats: { hasRoxzoneSplits: true },
    historicalBenchmarks: {},
  };
  assert.equal(oneStationCostsRace(a)?.triggerKey, "one_station_costs_the_race");
});

test("oneStationCostsRace returns null when no outlier exists", () => {
  const athlete = makeAthlete({
    rank: 3,
    roxzoneSplits: { skierg_rox_in: 6, skierg_rox_out: 8 },
  });
  const a = {
    athletes: [makeAthlete({ rank: 1 }), makeAthlete({ rank: 2 }), athlete],
    raceStats: {
      segments: { roxzone_total: { median: 200 }, skierg_rox_total: { median: 12 } },
      rankCorrelations: {},
    },
    narrativeStats: { hasRoxzoneSplits: true },
    historicalBenchmarks: {},
  };
  assert.equal(oneStationCostsRace(a), null);
});
