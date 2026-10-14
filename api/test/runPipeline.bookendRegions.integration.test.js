import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../engine/runPipeline.js";

const exercise = { id: "squat", n: "Back Squat", sw: "squat", sw2: "squat_compound", mp: "squat", eq: [], pref: ["strength_main"], den: 1, cx: 1, load: true, mc: "compound", tr: [] };
const pgc = {
  total_weeks_default: 2,
  progression_by_rank_json: { beginner: { weekly_set_step: 0, max_extra_sets: 0 } },
  builder: {
    day_templates: [{ day_key: "day1", focus: "lower_body", ordered_slots: [{ slot: "A:squat", sw2: "squat_compound", requirePref: "strength_main" }] }],
    sets_by_duration: { "40": { A: 3, B: 3, C: 2, D: 2 } }, block_budget: { "40": 4 }, slot_defaults: {}, exclude_movement_classes: ["cardio"]
  },
  segmentation: { block_semantics: { A: { preferred_segment_type: "single", purpose: "main" } } },
  progression: { apply_to_purposes: ["main"] },
};
const inputs = {
  clientProfile: { response: { duration_mins: 40, days_per_week: 1, fitness_rank: 1, preferred_days: "Mon" } },
  exercises: { response: { results: [{ id: "squat", name: "Back Squat", swap_group_id_1: "squat", swap_group_id_2: "squat_compound", movement_pattern_primary: "squat", preferred_in_json: '["strength_main"]', equipment_json: "[]", density_rating: 1, complexity_rank: 1, is_loadable: true, movement_class: "compound", target_regions_json: "[]" }] } },
  configs: { catalogBuilds: { response: { results: [{ version: "v3", catalog_json: JSON.stringify({ schema: "catalog_v3", ex: [exercise] }), rep_rules_json: "[]", narration_json: "[]" }] } }, genConfigs: { response: { results: [{ program_generation_config_json: "{}" }] } } },
};
const warmup = { warmup_exercise_id: "squat-warmup", name: "Squat Warm-up", target_regions_json: ["quads", "glutes"], equipment_items_slugs: [], duration_or_reps_label: "10 reps", rounds: 1 };
const cooldown = { cooldown_exercise_id: "squat-cooldown", name: "Squat Cool-down", target_regions_json: ["quads", "glutes"], equipment_items_slugs: [], duration_or_reps_label: "30 sec", rounds: 1 };
const db = { async query(sql) {
  if (sql.includes("FROM public.narration_template") || sql.includes("FROM program_rep_rule") || sql.includes("FROM program_generation_config")) return { rows: [] };
  if (sql.includes("FROM warmup_exercise we")) return { rows: [warmup] };
  if (sql.includes("FROM cooldown_exercise ce")) return { rows: [cooldown] };
  if (sql.includes("JOIN warmup_exercise") || sql.includes("JOIN cooldown_exercise")) return { rows: [] };
  throw new Error(`Unexpected SQL: ${sql}`);
} };

test("pipeline adds bookends from movement patterns when catalogue regions are empty", async () => {
  const out = await runPipeline({ inputs, programType: "hypertrophy", request: {
    program_generation_config_json: JSON.stringify(pgc), program_length: 2,
    narration_templates_json: JSON.stringify([{ template_id: "title", scope: "program", field: "PROGRAM_TITLE", priority: 1, text_pool_json: ["Program"] }]),
  }, db });
  for (const week of out.program.weeks) for (const day of week.days) {
    assert.ok(day.segments.find(s => s.segment_type === "warmup")?.items.length >= 1, JSON.stringify({ day, debug: out.debug.step5 }));
    assert.ok(day.segments.find(s => s.segment_type === "cooldown")?.items.length >= 1);
  }
  assert.ok(out.debug.step5.adoption.total.bookend_region_fallbacks > 0);
});
