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

function mockContract(largestCategoryKey) {
  return {
    gapReconciliation: {
      largestCategory: largestCategoryKey ? { key: largestCategoryKey } : null,
    },
  };
}

// buildBackgroundSection returns { copy, category } (or null when no section applies) — this
// helper extracts just the copy string so most assertions below don't need to change shape.
function copyOf(...args) {
  return buildBackgroundSection(...args)?.copy ?? null;
}

const LIMITER_COPY_EXPECTATIONS = [
  {
    background: "new_to_strength",
    run: /running pattern is where the gap sits/,
    station: /loaded stations.*where a strengthening investment/s,
  },
  {
    background: "general_gym",
    run: /running as the gap/,
    station: /station execution as the gap/,
  },
  {
    background: "crossfit_hybrid",
    run: /gap is in the running/,
    station: /sustain station output/,
  },
  {
    background: "strength_sport",
    run: /gap.*is aerobic.*8 km of running/s,
    station: /station performance is where the time is being lost/,
  },
  {
    background: "running",
    run: /running is where the time is being lost/,
    station: /gap sits in station capacity/,
  },
  {
    background: "crossfit",
    run: /gap is in the running/,
    station: /sustain station output/,
  },
  {
    background: "strength_sports",
    run: /gap.*is aerobic.*8 km of running/s,
    station: /station performance is where the time is being lost/,
  },
  {
    background: "team_sports",
    run: /8 km of running.*highest-leverage aerobic investment/s,
    station: /station performance as the limiter/,
  },
];

test("background copy names the actual limiter area for every recognised background", () => {
  for (const { background, run, station } of LIMITER_COPY_EXPECTATIONS) {
    const runCopy = copyOf(
      mockAnalysis({ limiterSegmentKey: "run_3", limiterType: "run" }),
      { primaryBackground: background },
    );
    const stationCopy = copyOf(
      mockAnalysis({ limiterSegmentKey: "wall_balls", limiterType: "station" }),
      { primaryBackground: background },
    );

    assert.match(runCopy, run, `${background} should identify running when the limiter is a run`);
    assert.match(stationCopy, station, `${background} should identify stations when the limiter is a station`);
  }
});

test("running background with station limiter returns aligned copy", () => {
  const copy = copyOf(mockAnalysis({ limiterSegmentKey: "wall_balls", limiterType: "station" }), { primaryBackground: "running" });
  assert.equal(typeof copy, "string");
  assert.match(copy, /aerobic durability/);
});

test("running background with run limiter returns inverted copy", () => {
  const copy = copyOf(mockAnalysis({ limiterSegmentKey: "run_1", limiterType: "run" }), { primaryBackground: "running" });
  assert.match(copy, /pacing strategy/);
});

test("crossfit background with station limiter returns aligned copy", () => {
  const copy = copyOf(mockAnalysis({ limiterSegmentKey: "sled_pull", limiterType: "station" }), { primaryBackground: "crossfit" });
  assert.match(copy, /specificity/);
});

test("crossfit background with run limiter returns inverted copy", () => {
  const copy = copyOf(mockAnalysis({ limiterSegmentKey: "run_time", limiterType: "aggregate" }), { primaryBackground: "crossfit" });
  assert.match(copy, /steady-state/);
});

test("strength sports background with run limiter returns aligned copy", () => {
  const copy = copyOf(mockAnalysis({ limiterSegmentKey: "run_2", limiterType: "run" }), { primaryBackground: "strength_sports" });
  assert.match(copy, /aerobic/);
});

test("strength sports background with station limiter returns inverted copy", () => {
  const copy = copyOf(mockAnalysis({ limiterSegmentKey: "wall_balls", limiterType: "station" }), { primaryBackground: "strength_sports" });
  assert.match(copy, /movement specificity/);
});

test("team sports background with run limiter returns aligned copy", () => {
  const copy = copyOf(mockAnalysis({ limiterSegmentKey: "run_time", limiterType: "aggregate" }), { primaryBackground: "team_sports" });
  assert.match(copy, /moderate-intensity/);
});

test("team sports background with station limiter returns inverted copy", () => {
  const copy = copyOf(mockAnalysis({ limiterSegmentKey: "sandbag_lunges", limiterType: "station" }), { primaryBackground: "team_sports" });
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
  const copy = copyOf(mockAnalysis(), { primaryBackground: "running" });
  assert.match(copy, /aerobic durability/);
});

test("contract category overrides a disagreeing run segment limiter", () => {
  const copy = copyOf(
    mockAnalysis({ limiterSegmentKey: "run_6", limiterType: "run" }),
    { primaryBackground: "crossfit_hybrid" },
    mockContract("work_time"),
  );

  assert.match(copy, /sustain station output/);
});

test("contract category overrides a disagreeing station segment limiter", () => {
  const copy = copyOf(
    mockAnalysis({ limiterSegmentKey: "wall_balls", limiterType: "station" }),
    { primaryBackground: "crossfit_hybrid" },
    mockContract("run_time"),
  );

  assert.match(copy, /gap is in the running/);
});

test("non-run and non-station contract categories behave like no clear limiter", () => {
  const copy = copyOf(
    mockAnalysis({ limiterSegmentKey: "run_6", limiterType: "run" }),
    { primaryBackground: "running" },
    mockContract("penalties"),
  );

  assert.match(copy, /aerobic durability/);
});

test("category is 'work_time' when the contract's largest category is stations, regardless of the single-segment limiter", () => {
  const result = buildBackgroundSection(
    mockAnalysis({ limiterSegmentKey: "run_6", limiterType: "run" }),
    { primaryBackground: "crossfit_hybrid" },
    mockContract("work_time"),
  );
  assert.equal(result.category, "work_time");
});

test("category is null when there is no clear run or station limiter", () => {
  const result = buildBackgroundSection(mockAnalysis(), { primaryBackground: "running" });
  assert.equal(result.category, null);
});
