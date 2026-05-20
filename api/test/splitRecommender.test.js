import test from "node:test";
import assert from "node:assert/strict";
import { defaultSplitForProgram, VALID_FOCUS_SLUGS } from "../src/utils/splitRecommender.js";

// ── defaultSplitForProgram ─────────────────────────────────────────────────

test("1-day programs always return full_body", () => {
  assert.deepEqual(defaultSplitForProgram("hypertrophy", 1), ["full_body"]);
  assert.deepEqual(defaultSplitForProgram("strength", 1), ["full_body"]);
});

test("2-day programs always return full_body x2", () => {
  assert.deepEqual(defaultSplitForProgram("hypertrophy", 2), ["full_body", "full_body"]);
  assert.deepEqual(defaultSplitForProgram("strength", 2), ["full_body", "full_body"]);
});

test("3-day programs return full_body x3", () => {
  assert.deepEqual(defaultSplitForProgram("hypertrophy", 3), ["full_body", "full_body", "full_body"]);
  assert.deepEqual(defaultSplitForProgram("strength", 3), ["full_body", "full_body", "full_body"]);
});

test("4-day programs return upper/lower alternating", () => {
  const expected = ["upper_body", "lower_body", "upper_body", "lower_body"];
  assert.deepEqual(defaultSplitForProgram("hypertrophy", 4), expected);
  assert.deepEqual(defaultSplitForProgram("strength", 4), expected);
});

test("5-day hypertrophy returns PPL variant", () => {
  assert.deepEqual(
    defaultSplitForProgram("hypertrophy", 5),
    ["push", "pull", "legs", "upper_body", "lower_body"],
  );
});

test("5-day strength returns upper/lower with full body finish", () => {
  assert.deepEqual(
    defaultSplitForProgram("strength", 5),
    ["upper_body", "lower_body", "upper_body", "lower_body", "full_body"],
  );
});

test("6-day hypertrophy returns PPL x2", () => {
  assert.deepEqual(
    defaultSplitForProgram("hypertrophy", 6),
    ["push", "pull", "legs", "push", "pull", "legs"],
  );
});

test("6-day strength returns upper/lower x3", () => {
  assert.deepEqual(
    defaultSplitForProgram("strength", 6),
    ["upper_body", "lower_body", "upper_body", "lower_body", "upper_body", "lower_body"],
  );
});

test("7-day programs return upper/lower with full_body on last day", () => {
  const result = defaultSplitForProgram("hypertrophy", 7);
  assert.equal(result.length, 7);
  assert.equal(result[6], "full_body");
  assert.ok(result.slice(0, 6).every((f) => f === "upper_body" || f === "lower_body"));
});

test("unknown program type falls through to hypertrophy defaults", () => {
  // Any type other than "strength" uses hypertrophy defaults for 5-day
  assert.deepEqual(
    defaultSplitForProgram("conditioning", 5),
    ["push", "pull", "legs", "upper_body", "lower_body"],
  );
});

test("all returned focuses are valid slugs for standard day counts", () => {
  const programTypes = ["hypertrophy", "strength"];
  const daysCounts = [1, 2, 3, 4, 5, 6, 7];
  for (const pt of programTypes) {
    for (const d of daysCounts) {
      const result = defaultSplitForProgram(pt, d);
      assert.equal(result.length, d, `Expected ${d} focuses for ${pt}/${d}`);
      for (const f of result) {
        assert.ok(VALID_FOCUS_SLUGS.has(f), `Unexpected slug "${f}" for ${pt}/${d}`);
      }
    }
  }
});

// ── VALID_FOCUS_SLUGS ──────────────────────────────────────────────────────

test("VALID_FOCUS_SLUGS contains the six canonical slugs", () => {
  const expected = ["full_body", "upper_body", "lower_body", "push", "pull", "legs"];
  for (const slug of expected) {
    assert.ok(VALID_FOCUS_SLUGS.has(slug), `Missing slug: ${slug}`);
  }
  assert.equal(VALID_FOCUS_SLUGS.size, expected.length);
});
