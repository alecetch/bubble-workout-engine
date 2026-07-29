import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderInsight } from "../copyRenderer.js";

const limiterInsight = {
  title: "{segment_subject} {segment_subject_verb} your biggest limiter",
  reportCopy: "{segment_subject} {segment_subject_verb} your largest opportunity.",
};

describe("HYROX insight copy grammar", () => {
  it("uses singular grammar for numbered run segments", () => {
    const copy = renderInsight(limiterInsight, {}, {}, "title", {
      segmentKey: "run_8",
      segmentLabel: "Run 8",
      confidenceGrade: "A",
      sampleSize: 500,
    });

    assert.equal(copy, "Run 8 is your biggest limiter");
  });

  it("uses singular grammar for station labels that end in s", () => {
    const copy = renderInsight(limiterInsight, {}, {}, "title", {
      segmentKey: "wall_balls",
      segmentLabel: "Wall Balls",
      confidenceGrade: "A",
      sampleSize: 500,
    });

    assert.equal(copy, "The Wall Balls station is your biggest limiter");
  });

  it("uses plural grammar for penalties", () => {
    const copy = renderInsight(limiterInsight, {}, {}, "title", {
      segmentKey: "penalties",
      segmentLabel: "Penalties",
      confidenceGrade: "A",
      sampleSize: 500,
    });

    assert.equal(copy, "Penalties are your biggest limiter");
  });
});
