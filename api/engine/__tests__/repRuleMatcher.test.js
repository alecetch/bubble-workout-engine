import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFallbackItemContext,
  makeItemContext,
  normalizeRule,
  pickBestRuleWithFallback,
} from "../repRuleMatcher.js";

function makeRule(overrides = {}) {
  return normalizeRule({
    rule_id: "rule_default",
    is_active: true,
    priority: 1,
    program_type: "hypertrophy",
    day_type: null,
    segment_type: "single",
    purpose: "main",
    movement_pattern: null,
    swap_group_id_1: null,
    swap_group_id_2: null,
    movement_class: null,
    equipment_slug: null,
    target_regions_json: null,
    schema_version: 1,
    ...overrides,
  });
}

function makeContext(ex = {}) {
  return makeItemContext({
    programType: "hypertrophy",
    schemaVersion: 1,
    dayType: "strength",
    purpose: "main",
    segType: "single",
    ex,
  });
}

test("pickBestRuleWithFallback prefers direct metadata match before fallback", () => {
  const rules = [
    makeRule({ rule_id: "fallback", priority: 5 }),
    makeRule({ rule_id: "specific", priority: 5, movement_pattern: "squat" }),
  ];

  const match = pickBestRuleWithFallback(
    rules,
    makeContext({ mp: "squat", sw2: "sq_comp", mc: "compound", eq: ["dumbbell"] }),
  );

  assert.equal(match.rule.rule_id, "specific");
  assert.equal(match.viaFallback, false);
});

test("pickBestRuleWithFallback can match on swap_group_id_1", () => {
  const rules = [
    makeRule({ rule_id: "fallback", priority: 5 }),
    makeRule({ rule_id: "specific_sw", priority: 5, swap_group_id_1: "row_erg" }),
  ];

  const match = pickBestRuleWithFallback(
    rules,
    makeContext({ sw: "row_erg", sw2: "cyclical_compound", mp: "cyclical_engine" }),
  );

  assert.equal(match.rule.rule_id, "specific_sw");
  assert.equal(match.viaFallback, false);
});

test("buildFallbackItemContext strips exercise-derived matching dimensions only", () => {
  const fallback = buildFallbackItemContext(
    makeContext({ mp: "squat", sw2: "sq_comp", mc: "compound", tr: ["quads"], eq: ["dumbbell"] }),
  );

  assert.equal(fallback.program_type, "hypertrophy");
  assert.equal(fallback.day_type, "strength");
  assert.equal(fallback.segment_type, "single");
  assert.equal(fallback.purpose, "main");
  assert.equal(fallback.movement_pattern, "");
  assert.equal(fallback.swap_group_id_1, "");
  assert.equal(fallback.swap_group_id_2, "");
  assert.equal(fallback.movement_class, "");
  assert.equal(fallback.equipment_slug, "");
  assert.deepEqual(fallback.target_regions, []);
});
