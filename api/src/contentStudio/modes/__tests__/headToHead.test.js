import test from "node:test";
import assert from "node:assert/strict";
import { headToHeadGenerator } from "../headToHeadGenerator.js";
import { raceAnalysis } from "./testHelpers.js";

test("returns 5 slides when both athletes found", async () => {
  const result = headToHeadGenerator(await raceAnalysis(), { athleteA: "Athlete 1", athleteB: "Athlete 2" });
  assert.equal(result.carouselSlides.length, 5);
});

test("decisive slide has at least three metrics", async () => {
  const result = headToHeadGenerator(await raceAnalysis(), { athleteA: "Athlete 1", athleteB: "Athlete 2" });
  assert.equal(result.carouselSlides[1].dataFields.metrics.length >= 3, true);
});

test("throws when athleteA is not found", async () => {
  const analysis = await raceAnalysis();
  assert.throws(() => headToHeadGenerator(analysis, { athleteA: "Nobody", athleteB: "Athlete 2" }), /Nobody/);
});

test("throws when athleteB is not found", async () => {
  const analysis = await raceAnalysis();
  assert.throws(() => headToHeadGenerator(analysis, { athleteA: "Athlete 1", athleteB: "Nobody" }), /Nobody/);
});

test("segment deltas in slides are all positive", async () => {
  const result = headToHeadGenerator(await raceAnalysis(), { athleteA: "Athlete 1", athleteB: "Athlete 2" });
  const deltas = result.carouselSlides.flatMap((slide) => slide.dataFields.segmentDeltas ?? []);
  assert.equal(deltas.every((delta) => delta.deltaSeconds >= 0), true);
});
