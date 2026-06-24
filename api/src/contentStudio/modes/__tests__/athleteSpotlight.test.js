import test from "node:test";
import assert from "node:assert/strict";
import { athleteSpotlightGenerator } from "../athleteSpotlightGenerator.js";
import { raceAnalysis } from "./testHelpers.js";

test("athleteSpotlightGenerator returns 5 slides", async () => {
  const result = athleteSpotlightGenerator(await raceAnalysis(), { athleteName: "Athlete 1" });
  assert.equal(result.carouselSlides.length, 5);
});

test("slide 1 template key is CS_AS_HOOK", async () => {
  const result = athleteSpotlightGenerator(await raceAnalysis(), { athleteName: "Athlete 1" });
  assert.equal(result.carouselSlides[0].templateKey, "CS_AS_HOOK");
});

test("slide 1 includes athlete name", async () => {
  const result = athleteSpotlightGenerator(await raceAnalysis(), { athleteName: "Athlete 1" });
  assert.equal(result.carouselSlides[0].dataFields.athleteNames.includes("Athlete 1"), true);
});

test("weakness slide has at least one metric", async () => {
  const result = athleteSpotlightGenerator(await raceAnalysis(), { athleteName: "Athlete 1" });
  assert.equal(result.carouselSlides[3].dataFields.metrics.length >= 1, true);
});

test("throws when athlete is not in race data", async () => {
  const analysis = await raceAnalysis();
  assert.throws(() => athleteSpotlightGenerator(analysis, { athleteName: "Nobody" }), /not found/);
});

test("caption draft is a non-empty string", async () => {
  const result = athleteSpotlightGenerator(await raceAnalysis(), { athleteName: "Athlete 1" });
  assert.equal(typeof result.captionDraft, "string");
  assert.equal(result.captionDraft.length > 0, true);
});
