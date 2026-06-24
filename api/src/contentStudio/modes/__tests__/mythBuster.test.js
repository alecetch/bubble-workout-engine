import test from "node:test";
import assert from "node:assert/strict";
import { mythBusterGenerator } from "../mythBusterGenerator.js";
import { raceAnalysis } from "./testHelpers.js";

test("sleds myth with high sled correlation is confirmed", async () => {
  const analysis = await raceAnalysis();
  analysis.raceStats.rankCorrelations.combined_sled = 0.75;
  const result = mythBusterGenerator(analysis, { myth: "sleds" });
  assert.equal(result.carouselSlides[4].dataFields.verdict, "CONFIRMED");
});

test("sleds myth with low sled correlation is busted", async () => {
  const analysis = await raceAnalysis();
  analysis.raceStats.rankCorrelations.combined_sled = 0.3;
  const result = mythBusterGenerator(analysis, { myth: "sleds" });
  assert.equal(result.carouselSlides[4].dataFields.verdict, "BUSTED");
});

test("running myth with high run correlation is busted", async () => {
  const analysis = await raceAnalysis();
  analysis.raceStats.rankCorrelations.run_total = 0.72;
  const result = mythBusterGenerator(analysis, { myth: "running" });
  assert.equal(result.carouselSlides[4].dataFields.verdict, "BUSTED");
});

test("all myth params complete without throwing", async () => {
  const analysis = await raceAnalysis();
  for (const myth of ["sleds", "wall_balls", "running", "stations"]) {
    assert.doesNotThrow(() => mythBusterGenerator(analysis, { myth }));
  }
});

test("returns 5 slides for each myth", async () => {
  const analysis = await raceAnalysis();
  for (const myth of ["sleds", "wall_balls", "running", "stations"]) {
    assert.equal(mythBusterGenerator(analysis, { myth }).carouselSlides.length, 5);
  }
});
