import test from "node:test";
import assert from "node:assert/strict";
import {
  createVariabilityState,
  getBlockStickyExerciseId,
  getMedAvoidCanonicalNames,
  getProgramStickyExerciseId,
  makeBlockFamilyKey,
  recordBlockStickyChoice,
  recordProgramStickyChoice,
} from "../variabilityState.js";

test("createVariabilityState starts empty", () => {
  const state = createVariabilityState();
  assert.equal(state.programSticky.size, 0);
  assert.equal(state.blockSticky.size, 0);
  assert.equal(state.blockHistory.size, 0);
});

test("program sticky records and retrieves by family", () => {
  const state = createVariabilityState();
  recordProgramStickyChoice(state, "hyrox_run", "run_erg");
  assert.equal(getProgramStickyExerciseId(state, "hyrox_run"), "run_erg");
});

test("block sticky is scoped by day and block occurrence", () => {
  const state = createVariabilityState();
  recordBlockStickyChoice(state, 1, "A", "carry_family", "carry_1", "farmers_carry");
  assert.equal(getBlockStickyExerciseId(state, 1, "A", "carry_family"), "carry_1");
  assert.equal(getBlockStickyExerciseId(state, 2, "A", "carry_family"), null);
  assert.equal(makeBlockFamilyKey(1, "A", "carry_family"), "1:A:carry_family");
});

test("med history accumulates canonical-name outcomes", () => {
  const state = createVariabilityState();
  recordBlockStickyChoice(state, 1, "A", "run_family", "run_1", "outdoor_run");
  recordBlockStickyChoice(state, 1, "B", "run_family", "run_2", "treadmill_run");
  assert.deepEqual(
    Array.from(getMedAvoidCanonicalNames(state, "run_family")).sort(),
    ["outdoor_run", "treadmill_run"],
  );
});
