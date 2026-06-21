import test from "node:test";
import assert from "node:assert/strict";
import { analyseRaceEvent } from "../raceEventAnalyser.js";
import { generateContentInsights } from "../contentInsightEngine.js";
import { athleteRows, mockBenchmarkPool } from "./fixtures.js";

test("generateContentInsights returns array sorted by composite score descending", async () => {
  const analysis = await analyseRaceEvent(athleteRows(), "open", "male", mockBenchmarkPool);
  const insights = generateContentInsights(analysis);
  assert.equal(insights.every((insight, index) => index === 0 || insights[index - 1].scores.compositeScore >= insight.scores.compositeScore), true);
});

test("compositeScore is between 0 and 1 for all insights", async () => {
  const analysis = await analyseRaceEvent(athleteRows(), "open", "male", mockBenchmarkPool);
  const insights = generateContentInsights(analysis);
  assert.equal(insights.every((insight) => insight.scores.compositeScore >= 0 && insight.scores.compositeScore <= 1), true);
});

test("winner_not_strongest_station does not trigger when winner stationRank is 1", async () => {
  const analysis = await analyseRaceEvent(athleteRows({ winnerStrongStation: true }), "open", "male", mockBenchmarkPool);
  const insights = generateContentInsights(analysis);
  assert.equal(insights.some((insight) => insight.type === "winner_not_strongest_station"), false);
});

test("myth_sleds_decide does not trigger when sled correlation is above 0.5", async () => {
  const analysis = await analyseRaceEvent(athleteRows({ sledDecides: true }), "open", "male", mockBenchmarkPool);
  analysis.raceStats.rankCorrelations.combined_sled = 0.8;
  const insights = generateContentInsights(analysis);
  assert.equal(insights.some((insight) => insight.type === "myth_sleds_decide"), false);
});

test("at least one insight is triggered from fixture data", async () => {
  const analysis = await analyseRaceEvent(athleteRows(), "open", "male", mockBenchmarkPool);
  assert.equal(generateContentInsights(analysis).length > 0, true);
});

test("each insight has evidence array with at least one string", async () => {
  const analysis = await analyseRaceEvent(athleteRows(), "open", "male", mockBenchmarkPool);
  const insights = generateContentInsights(analysis);
  assert.equal(insights.every((insight) => insight.evidence.length >= 1 && insight.evidence.every((item) => typeof item === "string")), true);
});
