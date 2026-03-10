import test from "node:test";
import assert from "node:assert/strict";
import { buildProgramFromDefinition } from "../steps/01_buildProgramFromDefinition.js";

function ex(
  id,
  name,
  mp,
  sw,
  sw2,
  movementClass,
  pref = ["hypertrophy_secondary"],
  loadable = true,
  regions = [],
) {
  return {
    exercise_id: id,
    name,
    movement_pattern_primary: mp,
    swap_group_id_1: sw,
    swap_group_id_2: sw2,
    movement_class: movementClass,
    preferred_in_json: pref,
    equipment_json: loadable ? ["barbell"] : ["bodyweight"],
    is_loadable: loadable,
    complexity_rank: 1,
    density_rating: 1,
    target_regions_json: regions,
    warmup_hooks: [],
  };
}

function makeExercisePool() {
  return [
    ex("ex-001", "Back Squat", "squat", "squat_back", "squat_compound", "compound", ["strength_main"], true, ["quads", "glutes"]),
    ex("ex-002", "Front Squat", "squat", "squat_front", "squat_compound", "compound", ["strength_main"], true, ["quads", "core"]),
    ex("ex-003", "Romanian Deadlift", "hinge", "hinge_rdl", "hinge_compound", "compound", ["strength_main"], true, ["hamstrings", "glutes"]),
    ex("ex-004", "Conventional Deadlift", "hinge", "hinge_deadlift", "hinge_compound", "compound", ["strength_main"], true, ["hamstrings", "back"]),
    ex("ex-005", "Barbell Bench Press", "push_horizontal", "push_horizontal_bb", "push_horizontal_compound", "compound", ["strength_main"], true, ["chest", "triceps"]),
    ex("ex-006", "Incline Bench Press", "push_horizontal", "push_horizontal_incline", "push_horizontal_compound", "compound", ["strength_main"], true, ["chest", "front_delts"]),
    ex("ex-007", "Bent-Over Row", "pull_horizontal", "pull_horizontal_row", "pull_horizontal_compound", "compound", ["hypertrophy_secondary"], true, ["back", "biceps"]),
    ex("ex-008", "Chest-Supported Row", "pull_horizontal", "pull_horizontal_machine", "pull_horizontal_compound", "compound", ["hypertrophy_secondary"], true, ["back", "rear_delts"]),
    ex("ex-009", "DB Incline Press", "push_horizontal", "push_horizontal_db", "", "compound", ["hypertrophy_secondary"], true, ["chest", "triceps"]),
    ex("ex-010", "Walking Lunge", "lunge", "quad_iso_unilateral", "", "compound", ["hypertrophy_secondary"], true, ["quads", "glutes"]),
    ex("ex-011", "Bulgarian Split Squat", "lunge", "quad_iso_unilateral", "", "compound", ["hypertrophy_secondary"], true, ["quads", "glutes"]),
    ex("ex-012", "Leg Extension", "knee_extension", "quad_iso_squat", "", "isolation", ["hypertrophy_secondary"], true, ["quads"]),
    ex("ex-013", "Lying Hamstring Curl", "knee_flexion", "hamstring_iso", "", "isolation", ["hypertrophy_secondary"], true, ["hamstrings"]),
    ex("ex-014", "Seated Hamstring Curl", "knee_flexion", "hamstring_iso", "", "isolation", ["hypertrophy_secondary"], true, ["hamstrings"]),
    ex("ex-015", "Cable Glute Kickback", "hip_extension", "glute_iso", "", "isolation", ["hypertrophy_secondary"], true, ["glutes"]),
    ex("ex-016", "Seated Calf Raise", "calves", "calf_iso", "", "isolation", ["hypertrophy_secondary"], true, ["calves"]),
    ex("ex-017", "Standing Calf Raise", "calves", "calf_iso", "", "isolation", ["hypertrophy_secondary"], true, ["calves"]),
    ex("ex-018", "Cable Curl", "arms", "arms", "", "isolation", ["hypertrophy_secondary"], true, ["biceps"]),
    ex("ex-019", "Triceps Pressdown", "arms", "arms", "", "isolation", ["hypertrophy_secondary"], true, ["triceps"]),
    ex("ex-020", "Rear Delt Fly", "shoulder_iso", "shoulder_iso", "", "isolation", ["hypertrophy_secondary"], true, ["rear_delts"]),
    ex("ex-021", "Ab Wheel Rollout", "anti_extension", "core", "", "isolation", ["hypertrophy_secondary"], false, ["core"]),
    ex("ex-022", "Pallof Press", "anti_extension", "core", "", "isolation", ["hypertrophy_secondary"], false, ["core"]),
  ];
}

function hypertrophyCompiledConfig() {
  return {
    programType: "hypertrophy",
    schemaVersion: 1,
    configKey: "hypertrophy_default_v1",
    source: "db",
    builder: {
      dayTemplates: [
        {
          day_key: "day1",
          focus: "lower",
          ordered_slots: [
            { slot: "A:squat", sw2: "squat_compound", requirePref: "strength_main" },
            { slot: "B:lunge", mp: "lunge", sw: "quad_iso_unilateral" },
            { slot: "C:quad", swAny: ["quad_iso_unilateral", "quad_iso_squat"], requirePref: "hypertrophy_secondary", fill_fallback_slot: "A:squat" },
            { slot: "C:calves", sw: "calf_iso", requirePref: "hypertrophy_secondary", preferLoadable: true, fill_fallback_slot: "B:lunge" },
            { slot: "D:core", mp: "anti_extension", sw: "core", fill_fallback_slot: "B:lunge" },
            { slot: "C:hinge_accessory", sw: "hamstring_iso", sw2: "hinge_compound", requirePref: "hypertrophy_secondary", fill_fallback_slot: "A:squat" },
          ],
        },
        {
          day_key: "day2",
          focus: "upper",
          ordered_slots: [
            { slot: "A:push_horizontal", sw2: "push_horizontal_compound", requirePref: "strength_main" },
            { slot: "B:pull_horizontal", sw2: "pull_horizontal_compound", requirePref: "hypertrophy_secondary" },
            { slot: "B:secondary_press", sw: "push_horizontal_db", sw2: "push_horizontal_compound", requirePref: "hypertrophy_secondary", fill_fallback_slot: "B:pull_horizontal" },
            { slot: "C:arms", sw: "arms", requirePref: "hypertrophy_secondary", fill_fallback_slot: "B:secondary_press" },
            { slot: "C:rear_delt", sw: "shoulder_iso", requirePref: "hypertrophy_secondary", fill_fallback_slot: "B:pull_horizontal" },
            { slot: "C:arms2", sw: "arms", requirePref: "hypertrophy_secondary", fill_fallback_slot: "C:arms" },
          ],
        },
        {
          day_key: "day3",
          focus: "posterior",
          ordered_slots: [
            { slot: "A:hinge", sw2: "hinge_compound", requirePref: "strength_main" },
            { slot: "B:secondary_lower", sw2: "squat_compound", requirePref: "hypertrophy_secondary" },
            { slot: "C:hamstring_iso", sw: "hamstring_iso", requirePref: "hypertrophy_secondary", fill_fallback_slot: "A:hinge" },
            { slot: "C:glute", sw: "glute_iso", requirePref: "hypertrophy_secondary", fill_fallback_slot: "A:hinge" },
            { slot: "D:core", mp: "anti_extension", sw: "core", fill_fallback_slot: "B:secondary_lower" },
            { slot: "C:calves", sw: "calf_iso", requirePref: "hypertrophy_secondary", preferLoadable: true, fill_fallback_slot: "B:secondary_lower" },
          ],
        },
      ],
      setsByDuration: {
        "40": { A: 3, B: 3, C: 2, D: 2 },
        "50": { A: 4, B: 3, C: 3, D: 2 },
        "60": { A: 5, B: 4, C: 3, D: 3 },
      },
      blockBudget: { "40": 4, "50": 5, "60": 6 },
      slotDefaults: {
        C: { requirePref: "hypertrophy_secondary" },
        D: { requirePref: "hypertrophy_secondary" },
      },
      excludeMovementClasses: ["cardio", "conditioning", "locomotion"],
    },
    segmentation: {
      blockSemantics: {
        A: { preferred_segment_type: "single", purpose: "main" },
        B: { preferred_segment_type: "superset", purpose: "secondary" },
        C: { preferred_segment_type: "giant_set", purpose: "accessory" },
        D: { preferred_segment_type: "single", purpose: "accessory" },
      },
    },
    progression: {
      progressionByRank: {},
      weekPhaseConfig: {},
      totalWeeksDefault: 4,
      applyToPurposes: ["main", "secondary", "accessory"],
    },
    raw: {
      programGenerationConfigRow: null,
      programGenerationConfigJson: {},
    },
  };
}

test("buildProgramFromDefinition hypertrophy structural invariants", async () => {
  const exercises = makeExercisePool();
  const inputs = {
    exercises: { response: { results: exercises } },
    clientProfile: { response: { minutes_per_session: 50, preferred_days_count: 3 } },
  };
  const request = { duration_mins: 50, days_per_week: 3 };
  const compiledConfig = hypertrophyCompiledConfig();

  const out = await buildProgramFromDefinition({ inputs, request, compiledConfig });
  assert.equal(out.program.program_type, "hypertrophy");
  assert.equal(out.program.schema, "program_hypertrophy_v1");
  assert.equal(out.program.days.length, 3);
  assert.equal(typeof out.debug.fills_add_sets, "number");

  for (const day of out.program.days) {
    assert.ok(day.blocks.length >= 1);
    assert.ok(day.blocks.some((b) => Boolean(b.ex_id)));
  }

  const day1First = out.program.days[0].blocks[0];
  assert.equal(day1First.block, "A");
  assert.ok(String(day1First.slot).startsWith("A:"));
});

test("buildProgramFromDefinition does not throw with minimal valid exercise pool", async () => {
  const exercises = makeExercisePool().slice(0, 20);
  const inputs = {
    exercises: { response: { results: exercises } },
    clientProfile: { response: { minutes_per_session: 50, preferred_days_count: 3 } },
  };
  const request = { duration_mins: 50, days_per_week: 3 };
  const compiledConfig = hypertrophyCompiledConfig();

  await assert.doesNotReject(() =>
    buildProgramFromDefinition({ inputs, request, compiledConfig }),
  );
});
