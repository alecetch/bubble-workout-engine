import test from "node:test";
import assert from "node:assert/strict";
import { analyseRaceEvent, spearmanCorrelation, STATION_KEYS } from "../raceEventAnalyser.js";
import { athleteRows, mockBenchmarkPool } from "./fixtures.js";

test("analyseRaceEvent returns athletes sorted by rank", async () => {
  const analysis = await analyseRaceEvent([...athleteRows()].reverse(), "open", "male", mockBenchmarkPool);
  assert.deepEqual(analysis.athletes.map((athlete) => athlete.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("winner runRank is 1 when they have fastest run total", async () => {
  const analysis = await analyseRaceEvent(athleteRows(), "open", "male", mockBenchmarkPool);
  assert.equal(analysis.athletes[0].runRank, 1);
});

test("spearmanCorrelation returns 1.0 for matching ranks", () => {
  assert.equal(spearmanCorrelation([1, 2, 3], [1, 2, 3]), 1);
});

test("spearmanCorrelation returns -1.0 for inverse ranks", () => {
  assert.equal(spearmanCorrelation([1, 2, 3], [3, 2, 1]), -1);
});

test("mostDecisiveStation is one of the station keys", async () => {
  const analysis = await analyseRaceEvent(athleteRows(), "open", "male", mockBenchmarkPool);
  assert.equal(STATION_KEYS.includes(analysis.narrativeStats.mostDecisiveStation), true);
});

test("wall_balls cv is finite and positive", async () => {
  const analysis = await analyseRaceEvent(athleteRows(), "open", "male", mockBenchmarkPool);
  assert.equal(Number.isFinite(analysis.raceStats.segments.wall_balls.cv), true);
  assert.equal(analysis.raceStats.segments.wall_balls.cv > 0, true);
});

test("historical benchmarks use aggregate fallback group and analyser metric keys", async () => {
  let sql = "";
  const db = {
    async query(queryText) {
      sql = queryText;
      return {
        rows: [
          { metric_key: "total_time", p10_seconds: 4000, p25_seconds: 4500, p50_seconds: 5000, p75_seconds: 5500, p90_seconds: 6000, p95_seconds: 6500 },
          { metric_key: "ski_erg", p10_seconds: 200, p25_seconds: 250, p50_seconds: 300, p75_seconds: 350, p90_seconds: 400, p95_seconds: 450 },
        ],
      };
    },
  };

  const analysis = await analyseRaceEvent(athleteRows(), "open", "male", db);

  assert.match(sql, /fallback_level = 1/);
  assert.equal(analysis.historicalBenchmarks.finish_time.p10_seconds, 4000);
  assert.equal(analysis.historicalBenchmarks.skierg.p10_seconds, 200);
  assert.equal(Number.isFinite(analysis.narrativeStats.fieldMedianPercentile), true);
  assert.equal(Number.isFinite(analysis.athletes[0].historicalPercentiles.finish_time), true);
  assert.equal(Number.isFinite(analysis.athletes[0].historicalPercentiles.skierg), true);
});
