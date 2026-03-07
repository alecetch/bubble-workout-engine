import test from "node:test";
import assert from "node:assert/strict";
import { applyRepRules } from "../04_applyRepRules.js";

function makeProgram({
  dayType = "strength",
  prefilled = {},
} = {}) {
  return {
    program_type: "hypertrophy",
    days: [
      {
        day_index: 1,
        day_type: dayType,
        segments: [
          {
            purpose: "main",
            segment_type: "single",
            ...prefilled.segment,
            items: [
              {
                ex_id: "ex1",
                ...prefilled.item,
              },
            ],
          },
        ],
      },
    ],
  };
}

function makeCatalogJson({
  mp = "squat",
  sw2 = "squat_compound",
  mc = "compound",
  tr = ["quads"],
  eq = ["dumbbell"],
} = {}) {
  return JSON.stringify({
    schema: "catalog_v3",
    ex: [
      {
        id: "ex1",
        mp,
        sw2,
        mc,
        tr,
        eq,
      },
    ],
  });
}

function makeRule(overrides = {}) {
  return {
    rule_id: "rule_default",
    is_active: true,
    priority: 1,
    program_type: "hypertrophy",
    day_type: null,
    segment_type: "single",
    purpose: "main",
    movement_pattern: null,
    swap_group_id_2: null,
    movement_class: null,
    equipment_slug: null,
    target_regions_json: null,
    schema_version: 1,
    reps_unit: "reps",
    rep_low: 6,
    rep_high: 8,
    rir_min: 1,
    rir_max: 3,
    rir_target: 2,
    tempo_eccentric: 2,
    tempo_pause_bottom: 0,
    tempo_concentric: 2,
    tempo_pause_top: 0,
    rest_after_set_sec: 90,
    rest_after_round_sec: 120,
    logging_prompt_mode: "hardest_set",
    notes_style: "neutral",
    ...overrides,
  };
}

function firstItem(result) {
  return result.program.days[0].segments[0].items[0];
}

function firstSegment(result) {
  return result.program.days[0].segments[0];
}

test("program_type mismatch excludes rule", async () => {
  const result = await applyRepRules({
    program: makeProgram(),
    catalogJson: makeCatalogJson(),
    repRules: [makeRule({ program_type: "strength", rule_id: "mismatch" })],
  });
  assert.equal(firstItem(result).rep_rule_id, undefined);
});

test("null optional fields act as wildcards", async () => {
  const result = await applyRepRules({
    program: makeProgram(),
    catalogJson: makeCatalogJson(),
    repRules: [makeRule({ day_type: null, movement_pattern: null, rule_id: "wild" })],
  });
  assert.equal(firstItem(result).rep_rule_id, "wild");
});

test("priority DESC wins", async () => {
  const result = await applyRepRules({
    program: makeProgram(),
    catalogJson: makeCatalogJson(),
    repRules: [
      makeRule({ rule_id: "low", priority: 1, rep_low: 5, rep_high: 5 }),
      makeRule({ rule_id: "high", priority: 10, rep_low: 9, rep_high: 9 }),
    ],
  });
  assert.equal(firstItem(result).rep_rule_id, "high");
  assert.equal(firstItem(result).reps_prescribed, "9-9");
});

test("tie on priority uses higher specificity", async () => {
  const result = await applyRepRules({
    program: makeProgram({ dayType: "strength" }),
    catalogJson: makeCatalogJson(),
    repRules: [
      makeRule({ rule_id: "generic", priority: 5, day_type: null }),
      makeRule({ rule_id: "specific", priority: 5, day_type: "strength" }),
    ],
  });
  assert.equal(firstItem(result).rep_rule_id, "specific");
});

test("tie on priority and specificity uses smaller rule_id ASC", async () => {
  const result = await applyRepRules({
    program: makeProgram(),
    catalogJson: makeCatalogJson(),
    repRules: [
      makeRule({ rule_id: "z_rule", priority: 5 }),
      makeRule({ rule_id: "a_rule", priority: 5 }),
    ],
  });
  assert.equal(firstItem(result).rep_rule_id, "a_rule");
});

test("day_type specific match works", async () => {
  const result = await applyRepRules({
    program: makeProgram({ dayType: "mixed" }),
    catalogJson: makeCatalogJson(),
    repRules: [
      makeRule({ rule_id: "wrong_day", day_type: "strength" }),
      makeRule({ rule_id: "right_day", day_type: "mixed" }),
    ],
  });
  assert.equal(firstItem(result).rep_rule_id, "right_day");
});

test("equipment_slug specific match beats wildcard on tie", async () => {
  const result = await applyRepRules({
    program: makeProgram(),
    catalogJson: makeCatalogJson({ eq: ["dumbbell"] }),
    repRules: [
      makeRule({ rule_id: "wild_eq", priority: 7, equipment_slug: null }),
      makeRule({ rule_id: "spec_eq", priority: 7, equipment_slug: "dumbbell" }),
    ],
  });
  assert.equal(firstItem(result).rep_rule_id, "spec_eq");
});

test("target_regions_json overlap match works (legacy JSON/future schema support)", async () => {
  // program_rep_rule in Postgres currently has no target_regions_json column.
  // This verifies tolerant matching for legacy JSON rule payloads / future schema expansion.
  const result = await applyRepRules({
    program: makeProgram(),
    catalogJson: makeCatalogJson({ tr: ["quads", "glutes"] }),
    repRules: [
      makeRule({ rule_id: "no_overlap", target_regions_json: ["chest"] }),
      makeRule({ rule_id: "overlap", target_regions_json: ["quads"] }),
    ],
  });
  assert.equal(firstItem(result).rep_rule_id, "overlap");
});

test("two-pass fallback applies purpose/segment defaults when movement metadata missing", async () => {
  const result = await applyRepRules({
    program: makeProgram(),
    catalogJson: JSON.stringify({ schema: "catalog_v3", ex: [{ id: "ex1" }] }),
    repRules: [makeRule({ rule_id: "fallback_rule", movement_pattern: null, swap_group_id_2: null })],
  });
  assert.equal(firstItem(result).rep_rule_id, "fallback_rule");
  assert.equal(Array.isArray(result.debug.notes), true);
});

test("no match leaves item unchanged and no rep_rule_id", async () => {
  const result = await applyRepRules({
    program: makeProgram({ prefilled: { item: { reps_prescribed: "10-12" } } }),
    catalogJson: makeCatalogJson(),
    repRules: [makeRule({ rule_id: "never", purpose: "secondary" })],
  });
  assert.equal(firstItem(result).rep_rule_id, undefined);
  assert.equal(firstItem(result).reps_prescribed, "10-12");
});

test("output writes: do-not-overwrite reps_prescribed, reps unit formatting, rir range, segment round rest, rep_rule_id overwrite", async () => {
  const result = await applyRepRules({
    program: makeProgram({
      prefilled: {
        item: {
          reps_prescribed: "already-set",
          rep_rule_id: "old_rule",
        },
        segment: {
          rep_rule_id: "old_rule",
        },
      },
    }),
    catalogJson: makeCatalogJson(),
    repRules: [makeRule({
      rule_id: "new_rule",
      reps_unit: "sec",
      rep_low: 30,
      rep_high: 45,
      rir_min: 0,
      rir_max: 2,
      rest_after_round_sec: 180,
    })],
  });

  const item = firstItem(result);
  const seg = firstSegment(result);

  assert.equal(item.reps_prescribed, "already-set");
  assert.equal(item.reps_unit, "sec");
  assert.equal(item.rir_min, 0);
  assert.equal(item.rir_max, 2);
  assert.equal(seg.rest_after_round_sec, 180);
  assert.equal(item.rep_rule_id, "new_rule");
  assert.equal(seg.rep_rule_id, "new_rule");
});

test("reps_unit reps does not append unit in reps_prescribed", async () => {
  const result = await applyRepRules({
    program: makeProgram(),
    catalogJson: makeCatalogJson(),
    repRules: [makeRule({ rule_id: "reps_rule", reps_unit: "reps", rep_low: 8, rep_high: 12 })],
  });
  assert.equal(firstItem(result).reps_prescribed, "8-12");
});
