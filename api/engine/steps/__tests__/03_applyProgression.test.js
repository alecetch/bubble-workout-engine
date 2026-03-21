import test from "node:test";
import assert from "node:assert/strict";
import { applyProgression } from "../03_applyProgression.js";

function makeSegmentedProgram(_weeksCount = 4, daysPerWeek = 1) {
  const days = [];
  for (let d = 1; d <= daysPerWeek; d++) {
    days.push({
      day_index: d,
      day_type: "strength",
      day_focus: null,
      duration_mins: 50,
      segments: [
        {
          segment_index: 1,
          segment_type: "single",
          purpose: "main",
          rounds: 1,
          items: [{ ex_id: "ex1", ex_name: "Squat", sets: 4 }],
        },
        {
          segment_index: 2,
          segment_type: "single",
          purpose: "accessory",
          rounds: 1,
          items: [{ ex_id: "ex2", ex_name: "Leg Press", sets: 3 }],
        },
      ],
    });
  }
  return { program_type: "strength", duration_mins: 50, days_per_week: daysPerWeek, days };
}

function makeConfigRow(overrides = {}) {
  return {
    program_type: "strength",
    schema_version: 1,
    is_active: "yes",
    config_key: "strength_test_v1",
    total_weeks_default: 4,
    progression_by_rank_json: JSON.stringify({
      beginner: {
        apply_to_purposes: ["main", "secondary"],
        weekly_set_step: 1,
        max_extra_sets: 3,
      },
      intermediate: {
        apply_to_purposes: ["main", "secondary"],
        weekly_set_step: 1,
        max_extra_sets: 4,
      },
    }),
    ...overrides,
  };
}

test("throws when program.days is missing", async () => {
  await assert.rejects(
    () => applyProgression({ program: {} }),
    /missing days/i,
  );
});

test("returns debug.ok=false when no matching config row", async () => {
  const program = makeSegmentedProgram();
  const result = await applyProgression({
    program,
    programType: "strength",
    programGenerationConfigs: [],
  });

  assert.equal(result.debug.ok, false);
  assert.match(result.debug.error, /No active config row/i);
  assert.equal(result.program, program);
});

test("returns debug.ok=false when no row matches program_type", async () => {
  const program = makeSegmentedProgram();
  const result = await applyProgression({
    program,
    programType: "strength",
    programGenerationConfigs: [makeConfigRow({ program_type: "hypertrophy" })],
  });

  assert.equal(result.debug.ok, false);
});

test("program.weeks has correct week count from total_weeks_default", async () => {
  const result = await applyProgression({
    program: makeSegmentedProgram(),
    programGenerationConfigs: [makeConfigRow({ total_weeks_default: 4 })],
    programType: "strength",
    fitnessRank: 1,
  });

  assert.equal(result.program.weeks.length, 4);
  assert.equal(result.program.weeks_count, 4);
});

test("programLength overrides total_weeks_default", async () => {
  const result = await applyProgression({
    program: makeSegmentedProgram(),
    programGenerationConfigs: [makeConfigRow({ total_weeks_default: 4 })],
    programType: "strength",
    fitnessRank: 1,
    programLength: 6,
  });

  assert.equal(result.program.weeks.length, 6);
});

test("programLength is clamped to 12 at most", async () => {
  const result = await applyProgression({
    program: makeSegmentedProgram(),
    programGenerationConfigs: [makeConfigRow({ total_weeks_default: 4 })],
    programType: "strength",
    fitnessRank: 1,
    programLength: 99,
  });

  assert.equal(result.program.weeks.length, 12);
});

test("week 1 sets equal base sets for main purpose", async () => {
  const result = await applyProgression({
    program: makeSegmentedProgram(),
    programGenerationConfigs: [makeConfigRow()],
    programType: "strength",
    fitnessRank: 1,
  });

  const week1Day = result.program.weeks[0].days[0];
  const mainItem = week1Day.segments[0].items[0];
  assert.equal(mainItem.sets, 4);
});

test("week 2 sets are base + weekly_set_step for main purpose", async () => {
  const result = await applyProgression({
    program: makeSegmentedProgram(),
    programGenerationConfigs: [makeConfigRow()],
    programType: "strength",
    fitnessRank: 1,
  });

  const week2Day = result.program.weeks[1].days[0];
  const mainItem = week2Day.segments[0].items[0];
  assert.equal(mainItem.sets, 5);
});

test("accessory purpose not in apply_to_purposes is not progressed", async () => {
  const result = await applyProgression({
    program: makeSegmentedProgram(),
    programGenerationConfigs: [makeConfigRow()],
    programType: "strength",
    fitnessRank: 1,
  });

  const week2Day = result.program.weeks[1].days[0];
  const accessoryItem = week2Day.segments[1].items[0];
  assert.equal(accessoryItem.sets, 3);
});

test("deload week reduces sets", async () => {
  const result = await applyProgression({
    program: makeSegmentedProgram(),
    programGenerationConfigs: [
      makeConfigRow({
        progression_by_rank_json: JSON.stringify({
          beginner: {
            apply_to_purposes: ["main", "secondary"],
            weekly_set_step: 1,
            max_extra_sets: 3,
            deload: { week: 4, set_multiplier: 0.5, apply_to_all: true },
          },
        }),
      }),
    ],
    programType: "strength",
    fitnessRank: 1,
  });

  const week4MainItem = result.program.weeks[3].days[0].segments[0].items[0];
  assert.equal(week4MainItem.sets, 2);
});

test("fitnessRank 2 uses intermediate progression config", async () => {
  const result = await applyProgression({
    program: makeSegmentedProgram(),
    programGenerationConfigs: [makeConfigRow()],
    programType: "strength",
    fitnessRank: 2,
  });

  assert.equal(result.debug.rank_key, "intermediate");
});

test("each week entry has week_index starting at 1", async () => {
  const result = await applyProgression({
    program: makeSegmentedProgram(),
    programGenerationConfigs: [makeConfigRow()],
    programType: "strength",
    fitnessRank: 1,
  });

  result.program.weeks.forEach((week, index) => {
    assert.equal(week.week_index, index + 1);
  });
});

test("template days preserved in program.days", async () => {
  const program = makeSegmentedProgram(4, 2);
  const result = await applyProgression({
    program,
    programGenerationConfigs: [makeConfigRow()],
    programType: "strength",
    fitnessRank: 1,
  });

  assert.equal(result.program.days.length, program.days.length);
  assert.deepEqual(result.program.days, result.program.template_days);
});
