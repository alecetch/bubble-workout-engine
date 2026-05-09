import test from "node:test";
import assert from "node:assert/strict";
import { applyExerciseProgressionOverrides } from "../07_applyExerciseProgressionOverrides.js";

function makeProgram() {
  return {
    weeks: [
      {
        week_index: 1,
        days: [
          {
            segments: [
              {
                purpose: "main",
                items: [
                  {
                    ex_id: "ex-1",
                    sets: 4,
                    reps_prescribed: "6-10",
                    rest_after_set_sec: 120,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        week_index: 4,
        days: [
          {
            segments: [
              {
                purpose: "main",
                items: [
                  {
                    ex_id: "ex-1",
                    sets: 4,
                    reps_prescribed: "6-10",
                    rest_after_set_sec: 120,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

test("returns unchanged debug when weeks are missing", () => {
  const program = { days: [] };
  const result = applyExerciseProgressionOverrides({
    program,
    progressionStateMap: new Map(),
    deloadWeekIndex: null,
  });

  assert.equal(result.program, program);
  assert.equal(result.debug.skipped, "no_weeks");
  assert.equal(result.debug.overrides_applied, 0);
});

test("applies load, reps, sets, and rest overrides for matching exercise", () => {
  const program = makeProgram();
  const result = applyExerciseProgressionOverrides({
    program,
    progressionStateMap: new Map([
      ["ex-1::main", {
        current_load_kg_override: 102.5,
        current_rep_target_override: 8,
        current_set_override: 5,
        current_rest_sec_override: 150,
        last_outcome: "increase_load",
      }],
    ]),
    deloadWeekIndex: null,
  });

  const item = result.program.weeks[0].days[0].segments[0].items[0];
  assert.equal(item.prescribed_load_kg, 102.5);
  assert.equal(item.reps_prescribed, "8");
  assert.equal(item.sets, 5);
  assert.equal(item.rest_after_set_sec, 150);
  assert.equal(result.debug.overrides_applied, 2);
});

test("suppresses positive overrides during structural deload week", () => {
  const program = makeProgram();
  const result = applyExerciseProgressionOverrides({
    program,
    progressionStateMap: new Map([
      ["ex-1::main", {
        current_load_kg_override: 110,
        last_outcome: "increase_load",
      }],
    ]),
    deloadWeekIndex: 4,
  });

  const week1Item = result.program.weeks[0].days[0].segments[0].items[0];
  const week4Item = result.program.weeks[1].days[0].segments[0].items[0];
  assert.equal(week1Item.prescribed_load_kg, 110);
  assert.equal(week4Item.prescribed_load_kg, undefined);
  assert.deepEqual(week4Item._progression_override_debug, { skipped: "deload_week" });
  assert.deepEqual(result.debug.weeks_with_deload_suppression, [4]);
});

test("applies local deload load override during structural deload week", () => {
  const program = makeProgram();
  const result = applyExerciseProgressionOverrides({
    program,
    progressionStateMap: new Map([
      ["ex-1::main", {
        current_load_kg_override: 95,
        last_outcome: "deload_local",
      }],
    ]),
    deloadWeekIndex: 4,
  });

  const week1Item = result.program.weeks[0].days[0].segments[0].items[0];
  const week4Item = result.program.weeks[1].days[0].segments[0].items[0];
  assert.equal(week1Item.prescribed_load_kg, 95);
  assert.equal(week4Item.prescribed_load_kg, 95);
  assert.deepEqual(week4Item._progression_override_debug, { applied: "deload_local_structural_week", outcome: "deload_local" });
  assert.equal(result.debug.overrides_applied, 2);
});

test("ignores missing progression state cleanly", () => {
  const program = makeProgram();
  const result = applyExerciseProgressionOverrides({
    program,
    progressionStateMap: new Map(),
    deloadWeekIndex: null,
  });

  const item = result.program.weeks[0].days[0].segments[0].items[0];
  assert.equal(item.prescribed_load_kg, undefined);
  assert.equal(result.debug.overrides_applied, 0);
});
