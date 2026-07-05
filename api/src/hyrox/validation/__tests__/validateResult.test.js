import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROXZONE_KEYS, RUN_KEYS, STATION_KEYS } from "../../config/segmentMap.js";
import { validateResult } from "../validateResult.js";

function segment(seconds) {
  return { seconds };
}

function validSinglesSegments(overrides = {}) {
  return {
    run_1: segment(300),
    run_2: segment(310),
    run_3: segment(320),
    run_4: segment(330),
    run_5: segment(340),
    run_6: segment(350),
    run_7: segment(360),
    run_8: segment(370),
    ski_erg: segment(250),
    sled_push: segment(60),
    sled_pull: segment(80),
    burpee_broad_jump: segment(200),
    row: segment(230),
    farmers_carry: segment(120),
    sandbag_lunges: segment(180),
    wall_balls: segment(150),
    roxzone_1: segment(30),
    roxzone_2: segment(30),
    roxzone_3: segment(30),
    roxzone_4: segment(30),
    roxzone_5: segment(30),
    roxzone_6: segment(30),
    roxzone_7: segment(30),
    roxzone_8: segment(30),
    ...overrides,
  };
}

function validDoublesSegments(overrides = {}) {
  return validSinglesSegments({
    sled_push: segment(30),
    sled_pull: segment(35),
    burpee_broad_jump: segment(100),
    row: segment(120),
    sandbag_lunges: segment(90),
    wall_balls: segment(80),
    ...overrides,
  });
}

function sumSegments(segments, keys) {
  return keys.reduce((sum, key) => sum + segments[key].seconds, 0);
}

function recordFromSegments({ division, segments, overrides = {} }) {
  const run_time_seconds = sumSegments(segments, RUN_KEYS);
  const work_time_seconds = sumSegments(segments, STATION_KEYS);
  const roxzone_time_seconds = sumSegments(segments, ROXZONE_KEYS);
  return {
    event_id: "event-1",
    event_name: "HYROX Test",
    gender: "male",
    division,
    age_group: "30-34",
    segments,
    run_time_seconds,
    work_time_seconds,
    roxzone_time_seconds,
    total_time_seconds: run_time_seconds + work_time_seconds + roxzone_time_seconds,
    ...overrides,
  };
}

function singlesRecord(overrides = {}) {
  const segments = overrides.segments ?? validSinglesSegments();
  return recordFromSegments({ division: "open", segments, overrides });
}

function doublesRecord(overrides = {}) {
  const segments = overrides.segments ?? validDoublesSegments();
  return recordFromSegments({ division: "doubles", segments, overrides });
}

describe("validateResult doubles eligibility", () => {
  it("doubles record with valid data has benchmarkEligibility.overall = true", () => {
    const result = validateResult(doublesRecord());
    assert.equal(result.benchmarkEligibility.overall, true);
  });

  it("doubles record with valid data has status pass or warning, not partial", () => {
    const result = validateResult(doublesRecord());
    assert.ok(["pass", "warning"].includes(result.status), `expected pass/warning, got ${result.status}`);
  });

  it("doubles record with unknown age_group remains partial", () => {
    const result = validateResult(doublesRecord({ age_group: "unknown" }));
    assert.equal(result.status, "partial");
    assert.equal(result.benchmarkEligibility.ageGroup, false);
  });
});

describe("validateResult per-division plausibility thresholds", () => {
  it("doubles burpee_broad_jump of 100s does not get a plausibility flag", () => {
    const result = validateResult(doublesRecord({
      segments: validDoublesSegments({ burpee_broad_jump: segment(100) }),
    }));
    assert.ok(!result.flags.includes("plausibility_burpee_broad_jump"));
  });

  it("open burpee_broad_jump of 100s gets a plausibility flag", () => {
    const result = validateResult(singlesRecord({
      segments: validSinglesSegments({ burpee_broad_jump: segment(100) }),
    }));
    assert.ok(result.flags.includes("plausibility_burpee_broad_jump"));
  });

  it("doubles sled_push of 30s does not get a plausibility flag", () => {
    const result = validateResult(doublesRecord({
      segments: validDoublesSegments({ sled_push: segment(30) }),
    }));
    assert.ok(!result.flags.includes("plausibility_sled_push"));
  });

  it("open sled_push of 30s gets a plausibility flag", () => {
    const result = validateResult(singlesRecord({
      segments: validSinglesSegments({ sled_push: segment(30) }),
    }));
    assert.ok(result.flags.includes("plausibility_sled_push"));
  });
});
