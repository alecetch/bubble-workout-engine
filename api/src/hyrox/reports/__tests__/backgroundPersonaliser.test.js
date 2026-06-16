import assert from "node:assert/strict";
import test from "node:test";
import { buildBackgroundSection } from "../backgroundPersonaliser.js";

function mockAnalysis({ limiterSegmentKey = null, limiterType = null } = {}) {
  return {
    headline: {
      biggestLimiter: limiterSegmentKey
        ? { segmentKey: limiterSegmentKey, type: limiterType ?? "station", label: "Test Station" }
        : null,
    },
    scores: { engineScore: 55, strengthScore: 55 },
    athleteArchetype: { key: "balanced_hybrid" },
  };
}

test("running background with station limiter returns aligned copy", () => {
  const copy = buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "wall_balls", limiterType: "station" }), { primaryBackground: "running" });
  assert.equal(typeof copy, "string");
  assert.match(copy, /aerobic durability/);
});

test("running background with run limiter returns inverted copy", () => {
  const copy = buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "run_1", limiterType: "run" }), { primaryBackground: "running" });
  assert.match(copy, /pacing strategy/);
});

test("crossfit background with station limiter returns aligned copy", () => {
  const copy = buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "sled_pull", limiterType: "station" }), { primaryBackground: "crossfit" });
  assert.match(copy, /specificity/);
});

test("crossfit background with run limiter returns inverted copy", () => {
  const copy = buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "run_time", limiterType: "aggregate" }), { primaryBackground: "crossfit" });
  assert.match(copy, /steady-state/);
});

test("strength sports background with run limiter returns aligned copy", () => {
  const copy = buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "run_2", limiterType: "run" }), { primaryBackground: "strength_sports" });
  assert.match(copy, /aerobic/);
});

test("strength sports background with station limiter returns inverted copy", () => {
  const copy = buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "wall_balls", limiterType: "station" }), { primaryBackground: "strength_sports" });
  assert.match(copy, /movement specificity/);
});

test("team sports background with run limiter returns aligned copy", () => {
  const copy = buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "run_time", limiterType: "aggregate" }), { primaryBackground: "team_sports" });
  assert.match(copy, /moderate-intensity/);
});

test("team sports background with station limiter returns inverted copy", () => {
  const copy = buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "sandbag_lunges", limiterType: "station" }), { primaryBackground: "team_sports" });
  assert.match(copy, /supporting the running/);
});

test("null background returns null", () => {
  assert.equal(buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "wall_balls" }), { primaryBackground: null }), null);
});

test("other background returns null", () => {
  assert.equal(buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "wall_balls" }), { primaryBackground: "other" }), null);
});

test("unknown background returns null", () => {
  assert.equal(buildBackgroundSection(mockAnalysis({ limiterSegmentKey: "wall_balls" }), { primaryBackground: "swimming" }), null);
});

test("running background with no limiter returns aligned copy", () => {
  const copy = buildBackgroundSection(mockAnalysis(), { primaryBackground: "running" });
  assert.match(copy, /aerobic durability/);
});
