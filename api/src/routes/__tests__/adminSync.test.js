import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshotSql } from "../adminExerciseCatalogue.js";

function makeExercise(load_estimation_metadata) {
  return {
    exercise_id: "bb_back_squat",
    name: "Back Squat",
    movement_class: "compound",
    load_estimation_metadata,
  };
}

test("exercise catalogue snapshot includes load_estimation_metadata as jsonb", () => {
  const sql = buildSnapshotSql([
    makeExercise({
      family: "barbell_lower",
      anchors: ["bodyweight", "estimated_1rm"],
    }),
  ]);

  assert.match(sql, /load_estimation_metadata/);
  assert.match(sql, /load_estimation_metadata = EXCLUDED\.load_estimation_metadata/);
  assert.match(sql, /'\{"family":"barbell_lower","anchors":\["bodyweight","estimated_1rm"\]\}'::jsonb/);
});

test("exercise catalogue snapshot writes null load_estimation_metadata as NULL", () => {
  const sql = buildSnapshotSql([makeExercise(null)]);

  assert.match(sql, /load_estimation_metadata/);
  assert.doesNotMatch(sql, /undefined/);
  assert.match(sql, /\n  NULL\n\)\nON CONFLICT \(exercise_id\) DO UPDATE SET/);
});

test("exercise catalogue snapshot covers coaching cue and load estimation columns", () => {
  const sql = buildSnapshotSql([
    {
      ...makeExercise({
        estimation_family: "squat",
        family_conversion_factor: 1,
      }),
      technique_cue: "Knees out, chest up",
      technique_setup: "Brace before you unlock the knees.",
      technique_execution_json: ["Break at hips and knees together"],
      technique_mistakes_json: ["Letting the chest collapse"],
      coaching_cues_json: ["Brace before you descend"],
    },
  ]);

  for (const column of [
    "technique_cue",
    "technique_setup",
    "technique_execution_json",
    "technique_mistakes_json",
    "coaching_cues_json",
    "load_estimation_metadata",
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`));
    assert.match(sql, new RegExp(`${column} = EXCLUDED\\.${column}`));
  }
});
