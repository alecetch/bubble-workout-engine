import test from "node:test";
import assert from "node:assert/strict";
import { buildProgramFromDefinition } from "../steps/01_buildProgramFromDefinition.js";
import { segmentProgram } from "../steps/02_segmentProgram.js";

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
    ex("ex-007", "Bent-Over Row", "pull_horizontal", "pull_horizontal_row", "pull_horizontal_compound", "compound", ["strength_main"], true, ["back", "biceps"]),
    ex("ex-008", "Chest-Supported Row", "pull_horizontal", "pull_horizontal_machine", "pull_horizontal_compound", "compound", ["strength_main"], true, ["back", "rear_delts"]),
    ex("ex-009", "Overhead Press", "push_vertical", "push_vertical", "", "compound", ["strength_main"], true, ["shoulders", "triceps"]),
    ex("ex-010", "Lat Pulldown", "pull_vertical", "pull_vertical", "", "compound", ["hypertrophy_secondary"], true, ["back", "biceps"]),
    ex("ex-011", "Walking Lunge", "lunge", "quad_iso_unilateral", "", "compound", ["hypertrophy_secondary"], true, ["quads", "glutes"]),
    ex("ex-012", "Leg Extension", "knee_extension", "quad_iso_unilateral", "", "isolation", ["hypertrophy_secondary"], true, ["quads"]),
    ex("ex-013", "Lying Hamstring Curl", "knee_flexion", "hamstring_iso", "", "isolation", ["hypertrophy_secondary"], true, ["hamstrings"]),
    ex("ex-014", "Cable Glute Kickback", "hip_extension", "glute_iso", "", "isolation", ["hypertrophy_secondary"], true, ["glutes"]),
    ex("ex-015", "Seated Calf Raise", "calves", "calf_iso", "", "isolation", ["hypertrophy_secondary"], true, ["calves"]),
    ex("ex-016", "Ab Wheel Rollout", "anti_extension", "core", "", "isolation", ["hypertrophy_secondary"], false, ["core"]),
  ];
}

function strengthCompiledConfig() {
  return {
    programType: "strength",
    schemaVersion: 1,
    configKey: "strength_default_v1",
    source: "db",
    builder: {
      dayTemplates: [
        {
          day_key: "day1",
          focus: "lower_strength",
          ordered_slots: [
            { slot: "A:squat_strength", sw2: "squat_compound", requirePref: "strength_main" },
            { slot: "B:hinge_strength", sw2: "hinge_compound", requirePref: "strength_main" },
            { slot: "C:lunge_strength", mp: "lunge", sw: "quad_iso_unilateral" },
            { slot: "C:hamstring_iso_strength", sw: "hamstring_iso", requirePref: "hypertrophy_secondary" },
            { slot: "D:core_strength", mp: "anti_extension", sw: "core" },
          ],
        },
        {
          day_key: "day2",
          focus: "upper_strength",
          ordered_slots: [
            { slot: "A:push_horizontal_strength", sw2: "push_horizontal_compound", requirePref: "strength_main" },
            { slot: "B:pull_horizontal_strength", sw2: "pull_horizontal_compound", requirePref: "strength_main" },
            { slot: "C:push_vertical_strength", mp: "push_vertical", sw: "push_vertical", requirePref: "strength_main" },
            { slot: "C:pull_vertical_strength", mp: "pull_vertical", sw: "pull_vertical" },
            { slot: "D:core_upper_strength", mp: "anti_extension", sw: "core" },
          ],
        },
        {
          day_key: "day3",
          focus: "posterior_strength",
          ordered_slots: [
            { slot: "A:hinge_posterior_strength", sw2: "hinge_compound", requirePref: "strength_main" },
            { slot: "B:squat_posterior_strength", sw2: "squat_compound", requirePref: "strength_main" },
            { slot: "C:glute_strength", sw: "glute_iso", requirePref: "hypertrophy_secondary" },
            { slot: "C:calves_strength", sw: "calf_iso", preferLoadable: true },
            { slot: "D:core_posterior_strength", mp: "anti_extension", sw: "core" },
          ],
        },
      ],
      setsByDuration: {
        "40": { A: 4, B: 3, C: 2, D: 2 },
        "50": { A: 5, B: 3, C: 2, D: 2 },
        "60": { A: 5, B: 4, C: 3, D: 2 },
      },
      blockBudget: { "40": 4, "50": 5, "60": 5 },
      slotDefaults: {
        C: { requirePref: "hypertrophy_secondary" },
        D: { requirePref: "hypertrophy_secondary" },
      },
      excludeMovementClasses: ["cardio", "conditioning", "locomotion"],
    },
    segmentation: {
      blockSemantics: {
        A: { preferred_segment_type: "single", purpose: "main" },
        B: { preferred_segment_type: "single", purpose: "secondary" },
        C: { preferred_segment_type: "single", purpose: "accessory" },
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

test("strength build + segment works with single-only block semantics", async () => {
  const inputs = {
    exercises: { response: { results: makeExercisePool() } },
    clientProfile: { response: { minutes_per_session: 50, preferred_days_count: 3 } },
  };
  const request = { duration_mins: 50, days_per_week: 3 };
  const compiledConfig = strengthCompiledConfig();

  const built = await buildProgramFromDefinition({ inputs, request, compiledConfig });
  assert.equal(built.program.program_type, "strength");
  assert.equal(built.program.schema, "program_strength_v1");
  assert.equal(built.program.days.length, 3);
  for (const day of built.program.days) {
    assert.ok(day.blocks.some((b) => Boolean(b.ex_id)));
  }

  const segmented = await segmentProgram({ program: built.program, compiledConfig });
  assert.equal(segmented.program.schema, "program_strength_v1_segmented");
  for (const day of segmented.program.days) {
    assert.ok(day.segments.length >= 1);
    for (const segment of day.segments) {
      assert.equal(segment.segment_type, "single");
    }
  }
});
