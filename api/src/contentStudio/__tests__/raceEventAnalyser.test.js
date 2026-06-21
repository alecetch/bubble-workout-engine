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
