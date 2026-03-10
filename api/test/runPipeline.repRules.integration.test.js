import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../engine/runPipeline.js";

function makeInputs({ repRulesJson } = {}) {
  return {
    clientProfile: {
      response: {
        duration_mins: 40,
        days_per_week: 1,
        fitness_rank: 1,
        preferred_days: "Mon",
      },
    },
    exercises: {
      response: {
        results: [
          {
            id: "ex1",
            name: "Goblet Squat",
            swap_group_id_1: "quad_iso_squat",
            swap_group_id_2: "squat_compound",
            movement_pattern_primary: "squat",
            preferred_in_json: "[\"strength_main\"]",
            equipment_json: "[\"dumbbell\"]",
            density_rating: 1,
            complexity_rank: 1,
            is_loadable: true,
            movement_class: "compound",
            target_regions_json: "[\"quads\"]",
            warmup_hooks: "[\"hips\"]",
          },
        ],
      },
    },
    configs: {
      catalogBuilds: {
        response: {
          results: [
            {
              version: "v3",
              catalog_json: JSON.stringify({
                schema: "catalog_v3",
                ex: [
                  {
                    id: "ex1",
                    n: "Goblet Squat",
                    sw: "quad_iso_squat",
                    sw2: "squat_compound",
                    mp: "squat",
                    eq: ["dumbbell"],
                    pref: ["strength_main"],
                    den: 1,
                    cx: 1,
                    load: true,
                    mc: "compound",
                    tr: ["quads"],
                    wh: ["hips"],
                  },
                ],
              }),
              rep_rules_json:
                repRulesJson ??
                JSON.stringify([
                  {
                    rule_id: "json_rule",
                    is_active: true,
                    priority: 1,
                    program_type: "hypertrophy",
                    segment_type: "single",
                    purpose: "main",
                    reps_unit: "reps",
                    rep_low: 8,
                    rep_high: 10,
                    rir_target: 2,
                    tempo_eccentric: 2,
                    tempo_pause_bottom: 0,
                    tempo_concentric: 2,
                    tempo_pause_top: 0,
                    rest_after_set_sec: 75,
                  },
                ]),
              narration_json: "[]",
            },
          ],
        },
      },
      genConfigs: {
        response: {
          results: [{ program_generation_config_json: "{}" }],
        },
      },
    },
  };
}

function findFirstRepRuleId(program) {
  for (const day of program?.days ?? []) {
    for (const seg of day?.segments ?? []) {
      for (const item of seg?.items ?? []) {
        if (item?.rep_rule_id) return item.rep_rule_id;
      }
    }
  }
  return null;
}

function makeBaseRequest(overrides = {}) {
  const fullPgcJson = {
    total_weeks_default: 4,
    progression_by_rank_json: {
      beginner: { weekly_set_step: 0, max_extra_sets: 0 },
    },
    builder: {
      day_templates: [
        {
          day_key: "day1",
          focus: "lower",
          ordered_slots: [{ slot: "A:squat", sw2: "squat_compound", requirePref: "strength_main" }],
        },
      ],
      sets_by_duration: {
        "40": { A: 3, B: 3, C: 2, D: 2 },
        "50": { A: 4, B: 3, C: 3, D: 2 },
        "60": { A: 5, B: 4, C: 3, D: 3 },
      },
      block_budget: { "40": 4, "50": 5, "60": 6 },
      slot_defaults: {
        C: { requirePref: "hypertrophy_secondary" },
        D: { requirePref: "hypertrophy_secondary" },
      },
      exclude_movement_classes: ["cardio", "conditioning", "locomotion"],
    },
    segmentation: {
      block_semantics: {
        A: { preferred_segment_type: "single", purpose: "main" },
        B: { preferred_segment_type: "superset", purpose: "secondary" },
        C: { preferred_segment_type: "giant_set", purpose: "accessory" },
        D: { preferred_segment_type: "single", purpose: "accessory" },
      },
    },
    progression: {
      apply_to_purposes: ["main", "secondary", "accessory"],
    },
  };
  return {
    program_generation_config_json: JSON.stringify(fullPgcJson),
    ...overrides,
  };
}

test("runPipeline uses DB rep rules when available", async () => {
  const db = {
    async query() {
      return {
        rows: [
          {
            rule_id: "db_rule",
            schema_version: 1,
            priority: 9,
            program_type: "hypertrophy",
            day_type: null,
            segment_type: "single",
            purpose: "main",
            movement_pattern: null,
            swap_group_id_2: null,
            movement_class: null,
            equipment_slug: null,
            reps_unit: "reps",
            rep_low: 9,
            rep_high: 11,
            rir_min: 1,
            rir_max: 3,
            rir_target: 2,
            tempo_eccentric: 2,
            tempo_pause_bottom: 0,
            tempo_concentric: 2,
            tempo_pause_top: 0,
            rest_after_set_sec: 90,
            rest_after_round_sec: 0,
            logging_prompt_mode: "hardest_set",
            notes_style: "neutral",
          },
        ],
      };
    },
  };

  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db,
  });

  assert.equal(out.debug.step4.source, "db");
  assert.equal(findFirstRepRuleId(out.program), "db_rule");
});

test("runPipeline falls back to catalog rep_rules_json when DB fetch fails", async () => {
  const db = {
    async query() {
      throw new Error("db unavailable");
    },
  };

  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db,
  });

  assert.equal(out.debug.step4.source, "json");
  assert.equal(findFirstRepRuleId(out.program), "json_rule");
  assert.equal(
    Array.isArray(out.debug.step4.notes) &&
      out.debug.step4.notes.some((note) => String(note).includes("Falling back to CatalogBuild rep_rules_json")),
    true,
  );
});
