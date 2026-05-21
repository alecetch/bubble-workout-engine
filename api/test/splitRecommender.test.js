import test from "node:test";
import assert from "node:assert/strict";
import { defaultSplitForProgram } from "../src/utils/splitRecommender.js";
import { buildProgramFromDefinition } from "../engine/steps/01_buildProgramFromDefinition.js";

function makeExercise(id, slot = "squat") {
  return {
    exercise_id: id,
    name: id,
    movement_pattern_primary: slot,
    swap_group_id_1: `${slot}_group`,
    swap_group_id_2: `${slot}_compound`,
    preferred_in_json: [],
    movement_class: "compound",
    is_loadable: true,
    equipment_json: [],
    density_rating: 1,
    complexity_rank: 1,
    target_regions_json: [],
    warmup_hooks: [],
  };
}

function makeInputs(preferredSplitJson = null, daysPerWeek = 4) {
  return {
    clientProfile: {
      response: {
        days_per_week: daysPerWeek,
        minutes_per_session: 50,
        preferred_split_json: preferredSplitJson,
      },
    },
    exercises: {
      response: {
        results: [
          makeExercise("squat_1", "squat"),
          makeExercise("hinge_1", "hinge"),
          makeExercise("push_1", "push"),
          makeExercise("pull_1", "pull"),
        ],
      },
    },
  };
}

function makeConfig() {
  return {
    programType: "hypertrophy",
    schemaVersion: 1,
    configKey: "split_test",
    source: "test",
    builder: {
      dayTemplates: [
        { day_key: "d1", focus: "upper_body", ordered_slots: [{ slot: "A:push", mp: "push" }] },
        { day_key: "d2", focus: "lower_body", ordered_slots: [{ slot: "A:squat", mp: "squat" }] },
        { day_key: "d3", focus: "upper_body", ordered_slots: [{ slot: "A:pull", mp: "pull" }] },
        { day_key: "d4", focus: "lower_body", ordered_slots: [{ slot: "A:hinge", mp: "hinge" }] },
      ],
      setsByDuration: { "50": { A: 3 } },
      blockBudget: { "50": 1 },
      slotDefaults: {},
    },
    segmentation: {
      blockSemantics: {
        A: { preferred_segment_type: "single", purpose: "main", post_segment_rest_sec: 90 },
      },
      blockSemanticsByFocus: {},
    },
  };
}

test("defaultSplitForProgram returns expected hypertrophy splits", () => {
  assert.deepEqual(defaultSplitForProgram("hypertrophy", 2), ["full_body", "full_body"]);
  assert.deepEqual(defaultSplitForProgram("hypertrophy", 3), ["full_body", "full_body", "full_body"]);
  assert.deepEqual(defaultSplitForProgram("hypertrophy", 4), ["upper_body", "lower_body", "upper_body", "lower_body"]);
  assert.deepEqual(defaultSplitForProgram("hypertrophy", 5), ["push", "pull", "legs", "upper_body", "lower_body"]);
  assert.deepEqual(defaultSplitForProgram("hypertrophy", 6), ["push", "pull", "legs", "push", "pull", "legs"]);
});

test("defaultSplitForProgram returns expected strength splits", () => {
  assert.deepEqual(defaultSplitForProgram("strength", 4), ["upper_body", "lower_body", "upper_body", "lower_body"]);
  assert.deepEqual(defaultSplitForProgram("strength", 5), ["upper_body", "lower_body", "upper_body", "lower_body", "full_body"]);
  assert.deepEqual(defaultSplitForProgram("strength", 6), ["upper_body", "lower_body", "upper_body", "lower_body", "upper_body", "lower_body"]);
});

test("buildProgramFromDefinition applies preferred split when length matches", async () => {
  const split = ["push", "pull", "legs", "full_body"];
  const result = await buildProgramFromDefinition({
    inputs: makeInputs({ day_focuses: split }, 4),
    compiledConfig: makeConfig(),
  });
  assert.deepEqual(result.program.days.map((day) => day.day_focus), split);
});

test("buildProgramFromDefinition falls back to template focus when split is absent or mismatched", async () => {
  const config = makeConfig();
  const absent = await buildProgramFromDefinition({
    inputs: makeInputs(null, 4),
    compiledConfig: config,
  });
  assert.deepEqual(absent.program.days.map((day) => day.day_focus), [
    "upper_body",
    "lower_body",
    "upper_body",
    "lower_body",
  ]);

  const mismatched = await buildProgramFromDefinition({
    inputs: makeInputs({ day_focuses: ["push"] }, 4),
    compiledConfig: config,
  });
  assert.deepEqual(mismatched.program.days.map((day) => day.day_focus), [
    "upper_body",
    "lower_body",
    "upper_body",
    "lower_body",
  ]);
});
