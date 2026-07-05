import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adaptEnrichedRow } from "../buildDoublesBenchmarks.js";

function row(overrides = {}) {
  return {
    division_category: "doubles_male",
    overall_time_seconds: 5000,
    run_total_seconds: 2400,
    station_total_seconds: 2100,
    roxzone_total_seconds: 500,
    split_coverage_score: 1,
    split_run_1: 301,
    split_run_2: 302,
    split_run_3: 303,
    split_run_4: 304,
    split_run_5: 305,
    split_run_6: 306,
    split_run_7: 307,
    split_run_8: 308,
    split_skierg: 250,
    split_sled_push: 310,
    split_sled_pull: 320,
    split_burpee_bj: 330,
    split_row: 340,
    split_farmers_carry: 350,
    split_sandbag_lunge: 360,
    split_wall_balls: 370,
    rox_skierg_in: 10,
    rox_skierg_out: 11,
    rox_sled_push_in: 12,
    rox_sled_push_out: 13,
    rox_sled_pull_in: 14,
    rox_sled_pull_out: 15,
    rox_burpee_bj_in: 16,
    rox_burpee_bj_out: 17,
    rox_row_in: 18,
    rox_row_out: 19,
    rox_farmers_carry_in: 20,
    rox_farmers_carry_out: 21,
    rox_sandbag_lunge_in: 22,
    rox_sandbag_lunge_out: 23,
    ...overrides,
  };
}

describe("adaptEnrichedRow", () => {
  it("maps all top-level time fields", () => {
    const adapted = adaptEnrichedRow(row());
    assert.equal(adapted.total_time_seconds, 5000);
    assert.equal(adapted.run_time_seconds, 2400);
    assert.equal(adapted.work_time_seconds, 2100);
    assert.equal(adapted.roxzone_time_seconds, 500);
  });

  it("maps station splits to the correct segment key names", () => {
    const adapted = adaptEnrichedRow(row());
    assert.equal(adapted.segments.ski_erg.seconds, 250);
    assert.equal(adapted.segments.burpee_broad_jump.seconds, 330);
    assert.equal(adapted.segments.sandbag_lunges.seconds, 360);
  });

  it("sums roxzone in/out for each roxzone segment", () => {
    const adapted = adaptEnrichedRow(row());
    assert.equal(adapted.segments.roxzone_1.seconds, 21);
    assert.equal(adapted.segments.roxzone_4.seconds, 33);
    assert.equal(adapted.segments.roxzone_7.seconds, 45);
  });

  it("returns null for roxzone segment when either in or out is null", () => {
    const adapted = adaptEnrichedRow(row({ rox_row_out: null }));
    assert.equal(adapted.segments.roxzone_5.seconds, null);
  });

  it("returns null for roxzone_8 because it is not captured in enriched data", () => {
    const adapted = adaptEnrichedRow(row());
    assert.equal(adapted.segments.roxzone_8.seconds, null);
  });

  it("includes all 8 run splits", () => {
    const adapted = adaptEnrichedRow(row());
    for (let i = 1; i <= 8; i += 1) {
      assert.equal(adapted.segments[`run_${i}`].seconds, 300 + i);
    }
  });

  it("sets segment-level values to null for low-coverage rows while keeping top-level metrics", () => {
    const adapted = adaptEnrichedRow(row({ split_coverage_score: 0.5 }));
    assert.equal(adapted.total_time_seconds, 5000);
    assert.equal(adapted.run_time_seconds, 2400);
    assert.equal(adapted.segments.run_1.seconds, null);
    assert.equal(adapted.segments.ski_erg.seconds, null);
    assert.equal(adapted.segments.roxzone_1.seconds, null);
  });
});

