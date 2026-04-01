import test from "node:test";
import assert from "node:assert/strict";
import { getSegmentPresentation } from "./segmentCardLogic";

test("warmup segment shows notes-only behavior and no log button", () => {
  const out = getSegmentPresentation({
    segmentType: "warmup",
    notes: "Prep shoulders and hips.",
    rounds: 2,
    exercises: [],
  });

  assert.equal(out.isWarmupOrCooldown, true);
  assert.equal(out.segmentHasExercises, false);
  assert.equal(out.showLogButton, false);
  assert.equal(out.showRoundsIndicator, false);
  assert.equal(out.notesText, "Prep shoulders and hips.");
});

test("cooldown segment shows notes fallback and no log button", () => {
  const out = getSegmentPresentation({
    segmentType: "cooldown",
    notes: " ",
    exercises: [],
  });

  assert.equal(out.isWarmupOrCooldown, true);
  assert.equal(out.segmentHasExercises, false);
  assert.equal(out.showLogButton, false);
  assert.equal(out.showRoundsIndicator, false);
  assert.equal(out.notesText, "No notes provided.");
});

test("non-warmup segment with no exercises hides log button", () => {
  const out = getSegmentPresentation({
    segmentType: "single",
    rounds: 1,
    exercises: [],
  });

  assert.equal(out.isWarmupOrCooldown, false);
  assert.equal(out.segmentHasExercises, false);
  assert.equal(out.showLogButton, false);
  assert.equal(out.showRoundsIndicator, false);
});

test("non-warmup segment with exercises shows log button", () => {
  const out = getSegmentPresentation({
    segmentType: "superset",
    rounds: 1,
    exercises: [{ id: "ex1" }],
  });

  assert.equal(out.isWarmupOrCooldown, false);
  assert.equal(out.segmentHasExercises, true);
  assert.equal(out.showLogButton, true);
  assert.equal(out.showRoundsIndicator, false);
});

test("segment with rounds > 1 and exercises shows rounds indicator", () => {
  const out = getSegmentPresentation({
    segmentType: "superset",
    rounds: 3,
    exercises: [{ id: "ex1" }],
  });

  assert.equal(out.showRoundsIndicator, true);
  assert.equal(out.roundsValue, 3);
});

test("segment with rounds == 1 does not show rounds indicator", () => {
  const out = getSegmentPresentation({
    segmentType: "superset",
    rounds: 1,
    exercises: [{ id: "ex1" }],
  });

  assert.equal(out.showRoundsIndicator, false);
  assert.equal(out.roundsValue, 1);
});
