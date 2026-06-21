import test from "node:test";
import assert from "node:assert/strict";
import { raceBreakdownGenerator } from "../raceBreakdownGenerator.js";
import { raceAnalysis } from "./testHelpers.js";

test("returns 5 slides", async () => {
  const result = raceBreakdownGenerator(await raceAnalysis());
  assert.equal(result.carouselSlides.length, 5);
});

test("decisive slide headline mentions a station name", async () => {
  const result = raceBreakdownGenerator(await raceAnalysis());
  assert.match(result.carouselSlides[1].dataFields.headline, /SkiErg|Sled|Burpee|Row|Farmer|Sandbag|Wall/);
});

test("caption draft is non-empty", async () => {
  const result = raceBreakdownGenerator(await raceAnalysis());
  assert.equal(result.captionDraft.length > 0, true);
});

test("modeKey is race_breakdown", async () => {
  const result = raceBreakdownGenerator(await raceAnalysis());
  assert.equal(result.modeKey, "race_breakdown");
});
