import test from "node:test";
import assert from "node:assert/strict";
import { findExerciseIdAlias } from "../adminExerciseCatalogue.js";

const exercises = [
  { exercise_id: "bb_back_squat", name: "Barbell Back Squat", is_archived: false },
  { exercise_id: "singlearm_db_row", name: "Single-Arm Dumbbell Row", is_archived: false },
  { exercise_id: "old_row_variant", name: "Old Row Variant", is_archived: true },
];

test("findExerciseIdAlias flags suffix variants of an existing canonical ID", () => {
  const result = findExerciseIdAlias(exercises, "bb_back_squat_v2");
  assert.deepEqual(result, {
    exercise_id: "bb_back_squat",
    name: "Barbell Back Squat",
  });
});

test("findExerciseIdAlias returns null for genuinely new IDs", () => {
  assert.equal(findExerciseIdAlias(exercises, "completely_new_exercise"), null);
});

test("findExerciseIdAlias ignores archived matches by default", () => {
  assert.equal(findExerciseIdAlias(exercises, "old_row_variant_v2"), null);
});

test("findExerciseIdAlias can include archived rows when requested", () => {
  const result = findExerciseIdAlias(exercises, "old_row_variant_v2", { ignoreArchived: false });
  assert.deepEqual(result, {
    exercise_id: "old_row_variant",
    name: "Old Row Variant",
  });
});
