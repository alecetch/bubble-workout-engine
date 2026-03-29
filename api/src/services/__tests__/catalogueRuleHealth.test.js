import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogueRuleHealthReport } from "../catalogueRuleHealth.js";

function makeConfigRows() {
  return [
    {
      config_key: "cfg_hypertrophy",
      program_type: "hypertrophy",
      program_generation_config_json: JSON.stringify({
        builder: {
          slot_defaults: {},
          day_templates: [
            {
              day_key: "day1",
              day_type: "strength",
              ordered_slots: [
                {
                  slot: "A:main",
                  sw2: "sq_comp",
                  requirePref: "home_lower",
                  pref_mode: "soft",
                },
                {
                  slot: "B:aux",
                  sw2: "lunge_comp",
                  requirePref: "missing_pref",
                  pref_mode: "strict",
                },
              ],
            },
          ],
        },
        segmentation: {
          block_semantics: {
            A: { purpose: "main", preferred_segment_type: "single" },
            B: { purpose: "main", preferred_segment_type: "single" },
          },
        },
      }),
    },
  ];
}

function makeEquipmentItems() {
  return [
    {
      exercise_slug: "dumbbell",
      no_equipment: false,
      minimal_equipment: true,
      decent_home_gym: true,
      commercial_gym: true,
      crossfit_hyrox_gym: true,
    },
  ];
}

function makeExercises() {
  return [
    {
      exercise_id: "ex1",
      name: "Goblet Squat",
      movement_class: "compound",
      movement_pattern_primary: "squat",
      swap_group_id_1: "sq",
      swap_group_id_2: "sq_comp",
      min_fitness_rank: 0,
      is_archived: false,
      preferred_in_json: ["home_lower"],
      equipment_items_slugs: ["dumbbell"],
    },
    {
      exercise_id: "ex2",
      name: "Reverse Lunge",
      movement_class: "compound",
      movement_pattern_primary: "lunge",
      swap_group_id_1: "lunge",
      swap_group_id_2: "lunge_comp",
      min_fitness_rank: 0,
      is_archived: false,
      preferred_in_json: [],
      equipment_items_slugs: [],
    },
  ];
}

function makeRepRules() {
  return [
    {
      rule_id: "rule_generic",
      is_active: true,
      priority: 1,
      program_type: "hypertrophy",
      day_type: null,
      segment_type: "single",
      purpose: "main",
      movement_pattern: null,
      swap_group_id_2: null,
      equipment_slug: null,
      schema_version: 1,
    },
    {
      rule_id: "rule_orphaned",
      is_active: true,
      priority: 8,
      program_type: "hypertrophy",
      day_type: "strength",
      segment_type: "single",
      purpose: "main",
      movement_pattern: "ghost_pattern",
      swap_group_id_2: "ghost_sw2",
      equipment_slug: "ghost_tool",
      schema_version: 1,
    },
  ];
}

test("health report flags orphaned rule dimensions from live catalogue drift", () => {
  const report = buildCatalogueRuleHealthReport({
    exercises: makeExercises(),
    repRules: makeRepRules(),
    configRows: makeConfigRows(),
    equipmentItems: makeEquipmentItems(),
  });

  const orphaned = report.orphaned_rules.rows.find((row) => row.rule_id === "rule_orphaned");
  assert.ok(orphaned);
  assert.equal(orphaned.severity, "warning");
  assert.deepEqual(
    orphaned.orphaned_dimensions.map((dim) => dim.field).sort(),
    ["equipment_slug", "movement_pattern", "swap_group_id_2"],
  );
});

test("health report flags missing requirePref tags referenced by active configs", () => {
  const report = buildCatalogueRuleHealthReport({
    exercises: makeExercises(),
    repRules: makeRepRules(),
    configRows: makeConfigRows(),
    equipmentItems: makeEquipmentItems(),
  });

  const missingPref = report.orphaned_prefs.rows.find((row) => row.pref_tag === "missing_pref");
  assert.ok(missingPref);
  assert.equal(missingPref.strict_refs, 1);
  assert.equal(missingPref.severity, "critical");
});

test("health report marks exercises as uncovered when they only match weak fallback rules", () => {
  const report = buildCatalogueRuleHealthReport({
    exercises: makeExercises(),
    repRules: makeRepRules(),
    configRows: makeConfigRows(),
    equipmentItems: makeEquipmentItems(),
  });

  const row = report.rule_coverage.rows.find(
    (entry) => entry.exercise_id === "ex1" && entry.program_type === "hypertrophy",
  );
  assert.ok(row);
  assert.equal(row.matched_rule_id, "rule_generic");
  assert.equal(row.is_fallback_only, true);
  assert.equal(row.severity, "warning");

  const uncovered = report.uncovered_exercises.rows.find(
    (entry) => entry.exercise_id === "ex1" && entry.program_type === "hypertrophy",
  );
  assert.ok(uncovered);
  assert.match(uncovered.reason, /fallback|No rep rule/i);
});

test("health report marks zero slot coverage as critical", () => {
  const report = buildCatalogueRuleHealthReport({
    exercises: makeExercises(),
    repRules: makeRepRules(),
    configRows: makeConfigRows(),
    equipmentItems: makeEquipmentItems(),
  });

  const zeroRow = report.slot_coverage.rows.find(
    (row) =>
      row.slot === "B:aux" &&
      row.preset === "commercial_gym" &&
      row.rank === 0,
  );
  assert.ok(zeroRow);
  assert.equal(zeroRow.count, 0);
  assert.equal(zeroRow.severity, "critical");
});
