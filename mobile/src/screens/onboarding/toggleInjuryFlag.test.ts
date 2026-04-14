import test from "node:test";
import assert from "node:assert/strict";
import { toggleInjuryFlag } from "./toggleInjuryFlag.js";

const NONE = "No known issues";

test("toggleInjuryFlag adds a new flag when none are selected", () => {
  assert.deepEqual(toggleInjuryFlag([], "Shoulder issues", NONE), ["Shoulder issues"]);
});

test("toggleInjuryFlag adds a second flag alongside an existing one", () => {
  assert.deepEqual(
    toggleInjuryFlag(["Shoulder issues"], "Knee issues", NONE),
    ["Shoulder issues", "Knee issues"],
  );
});

test("toggleInjuryFlag removes an already selected flag", () => {
  assert.deepEqual(toggleInjuryFlag(["Shoulder issues"], "Shoulder issues", NONE), []);
});

test("toggleInjuryFlag selects noneSlug when it was not selected", () => {
  assert.deepEqual(toggleInjuryFlag([], NONE, NONE), [NONE]);
});

test("toggleInjuryFlag clears noneSlug when it was already selected", () => {
  assert.deepEqual(toggleInjuryFlag([NONE], NONE, NONE), []);
});

test("toggleInjuryFlag removes noneSlug when adding a specific flag", () => {
  assert.deepEqual(toggleInjuryFlag([NONE], "Shoulder issues", NONE), ["Shoulder issues"]);
});

test("toggleInjuryFlag replaces other flags when clicking noneSlug", () => {
  assert.deepEqual(toggleInjuryFlag(["Shoulder issues", "Knee issues"], NONE, NONE), [NONE]);
});

test("toggleInjuryFlag ignores empty clicked values", () => {
  assert.deepEqual(toggleInjuryFlag(["Shoulder issues"], "", NONE), ["Shoulder issues"]);
});

test("toggleInjuryFlag deduplicates existing values", () => {
  assert.deepEqual(
    toggleInjuryFlag(["Shoulder issues", "Shoulder issues"], "Knee issues", NONE),
    ["Shoulder issues", "Knee issues"],
  );
});
