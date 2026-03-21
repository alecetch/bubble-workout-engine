import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProgramFromDefinition,
  deriveEquipmentProfile,
  resolveSlotVariant,
} from "../01_buildProgramFromDefinition.js";

function makeExercise({
  id,
  name = "Test Ex",
  mp = "squat",
  sw = "squat_group",
  sw2 = "squat_compound",
  pref = [],
  mc = "compound",
  loadable = false,
  regions = [],
} = {}) {
  return {
    exercise_id: id,
    name,
    movement_pattern_primary: mp,
    swap_group_id_1: sw,
    swap_group_id_2: sw2,
    preferred_in_json: pref,
    movement_class: mc,
    is_loadable: loadable,
    equipment_json: [],
    density_rating: 1,
    complexity_rank: 1,
    target_regions_json: regions,
    warmup_hooks: [],
  };
}

function makeMinimalCompiledConfig(overrides = {}) {
  return {
    programType: "strength",
    schemaVersion: 1,
    configKey: "strength_test_v1",
    source: "test",
    builder: {
      dayTemplates: [["A:squat", "B:pull_horizontal"]],
      setsByDuration: { "50": { A: 5, B: 4, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      slotDefaults: {},
    },
    segmentation: {
      blockSemantics: {
        A: { preferred_segment_type: "single", purpose: "main", post_segment_rest_sec: 90 },
        B: { preferred_segment_type: "single", purpose: "secondary", post_segment_rest_sec: 60 },
        C: { preferred_segment_type: "superset", purpose: "accessory", post_segment_rest_sec: 45 },
        D: { preferred_segment_type: "giant_set", purpose: "accessory", post_segment_rest_sec: 30 },
      },
      blockSemanticsByFocus: {},
    },
    ...overrides,
  };
}

function makeInputs(exercises = [], clientProfile = {}) {
  return {
    clientProfile: {
      response: {
        equipment_items_slugs: ["barbell"],
        minutes_per_session: 50,
        ...clientProfile,
      },
    },
    exercises: { response: { results: exercises } },
  };
}

test("returns full when barbell is present", () => {
  assert.equal(deriveEquipmentProfile(["barbell", "dumbbells"]), "full");
});

test("returns full when trap_bar is present", () => {
  assert.equal(deriveEquipmentProfile(["trap_bar"]), "full");
});

test("returns minimal when only dumbbells", () => {
  assert.equal(deriveEquipmentProfile(["dumbbells"]), "minimal");
});

test("returns bodyweight when empty", () => {
  assert.equal(deriveEquipmentProfile([]), "bodyweight");
});

test("returns bodyweight when null", () => {
  assert.equal(deriveEquipmentProfile(null), "bodyweight");
});

test("returns slotDef unchanged when no variants array", () => {
  const slotDef = { slot: "A:squat", sw: "squat" };
  assert.equal(resolveSlotVariant(slotDef, "full"), slotDef);
});

test("returns slotDef unchanged when no variant matches equipment_profile", () => {
  const slotDef = {
    slot: "A:squat",
    sw: "squat_group",
    variants: [{ when: { equipment_profile: "bodyweight" }, sw: "bodyweight_squat" }],
  };
  const result = resolveSlotVariant(slotDef, "full");
  assert.equal(result, slotDef);
  assert.equal(result.sw, "squat_group");
});

test("applies matching variant fields and preserves slot name", () => {
  const slotDef = {
    slot: "A:squat",
    sw: "squat_group",
    variants: [{ when: { equipment_profile: "bodyweight" }, sw: "bodyweight_squat" }],
  };
  const result = resolveSlotVariant(slotDef, "bodyweight");
  assert.equal(result.slot, "A:squat");
  assert.equal(result.sw, "bodyweight_squat");
});

test("throws when exercise results are not array-like", async () => {
  await assert.rejects(
    () =>
      buildProgramFromDefinition({
        inputs: {
          clientProfile: { response: { equipment_items_slugs: ["barbell"], minutes_per_session: 50 } },
          exercises: { response: { results: { bad: true } } },
        },
        request: {},
        compiledConfig: makeMinimalCompiledConfig(),
      }),
    /map is not a function/i,
  );
});

test("returns program with correct shape for 1 day / 2 slots", async () => {
  const exercises = [
    makeExercise({ id: "ex1", mp: "squat", sw: "squat_group", sw2: "squat_compound" }),
    makeExercise({ id: "ex2", mp: "pull", sw: "pull_group", sw2: "pull_compound" }),
  ];
  const compiledConfig = makeMinimalCompiledConfig({
    builder: {
      dayTemplates: [
        [
          { slot: "A:squat", mp: "squat", sw: "squat_group", sw2: "squat_compound" },
          { slot: "B:pull_horizontal", mp: "pull", sw: "pull_group", sw2: "pull_compound" },
        ],
      ],
      setsByDuration: { "50": { A: 5, B: 4, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      slotDefaults: {},
    },
  });

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises),
    request: {},
    compiledConfig,
  });

  assert.equal(result.program.days.length, 1);
  assert.equal(result.program.days_per_week, 3);
  assert.equal(result.program.duration_mins, 50);
  assert.equal(result.program.program_type, "strength");
  assert.equal(result.program.schema, "program_strength_v1");
  assert.equal(typeof result.debug, "object");
});

test("days_per_week is clamped to dayTemplates.length", async () => {
  const exercises = [
    makeExercise({ id: "sq1", mp: "squat", sw: "squat_group", sw2: "squat_compound" }),
    makeExercise({ id: "pull1", mp: "pull", sw: "pull_group", sw2: "pull_compound" }),
  ];
  const compiledConfig = makeMinimalCompiledConfig({
    builder: {
      dayTemplates: [
        [{ slot: "A:squat", mp: "squat", sw: "squat_group", sw2: "squat_compound" }],
        [{ slot: "A:pull", mp: "pull", sw: "pull_group", sw2: "pull_compound" }],
      ],
      setsByDuration: { "50": { A: 5, B: 4, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      slotDefaults: {},
    },
  });

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises),
    request: { days_per_week: 99 },
    compiledConfig,
  });

  assert.equal(result.program.days.length, 2);
});

test("duration_mins is clamped to 40 when request says 30", async () => {
  const exercises = [makeExercise({ id: "sq1", mp: "squat", sw: "squat_group", sw2: "squat_compound" })];
  const compiledConfig = makeMinimalCompiledConfig({
    builder: {
      dayTemplates: [[{ slot: "A:squat", mp: "squat", sw: "squat_group", sw2: "squat_compound" }]],
      setsByDuration: {
        "40": { A: 3, B: 3, C: 2, D: 2 },
        "50": { A: 5, B: 4, C: 3, D: 2 },
      },
      blockBudget: { "40": 4, "50": 5 },
      slotDefaults: {},
    },
  });

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises),
    request: { duration_mins: 30, days_per_week: 1 },
    compiledConfig,
  });

  assert.equal(result.program.duration_mins, 40);
});

test("duration_mins is clamped to 60 when request says 90", async () => {
  const exercises = [makeExercise({ id: "sq1", mp: "squat", sw: "squat_group", sw2: "squat_compound" })];
  const compiledConfig = makeMinimalCompiledConfig({
    builder: {
      dayTemplates: [[{ slot: "A:squat", mp: "squat", sw: "squat_group", sw2: "squat_compound" }]],
      setsByDuration: {
        "50": { A: 5, B: 4, C: 3, D: 2 },
        "60": { A: 6, B: 5, C: 4, D: 3 },
      },
      blockBudget: { "50": 5, "60": 6 },
      slotDefaults: {},
    },
  });

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises),
    request: { duration_mins: 90, days_per_week: 1 },
    compiledConfig,
  });

  assert.equal(result.program.duration_mins, 60);
});

test("when exercise matches slot, block has ex_id and sets", async () => {
  const exercises = [makeExercise({ id: "sq1", mp: "squat", sw: "squat_group", sw2: "squat_compound" })];
  const compiledConfig = makeMinimalCompiledConfig({
    builder: {
      dayTemplates: [[{ slot: "A:squat", mp: "squat", sw: "squat_group", sw2: "squat_compound" }]],
      setsByDuration: { "50": { A: 5, B: 4, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      slotDefaults: {},
    },
  });

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises),
    request: { days_per_week: 1 },
    compiledConfig,
  });

  const block = result.program.days[0].blocks[0];
  assert.equal(block.ex_id, "sq1");
  assert.equal(Number.isFinite(block.sets) && block.sets > 0, true);
});

test("when no exercise matches slot, block is fill add_sets", async () => {
  const exercises = [makeExercise({ id: "bike1", mp: "conditioning", mc: "conditioning" })];
  const compiledConfig = makeMinimalCompiledConfig({
    builder: {
      dayTemplates: [["A:squat"]],
      setsByDuration: { "50": { A: 5, B: 4, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      slotDefaults: {},
      excludeMovementClasses: ["conditioning"],
    },
  });

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises),
    request: { days_per_week: 1 },
    compiledConfig,
  });

  const block = result.program.days[0].blocks[0];
  assert.equal(block.fill, "add_sets");
});

test("excludes conditioning exercises from allowedSet", async () => {
  const cardio = makeExercise({ id: "bike1", mp: "conditioning", mc: "conditioning" });
  const squat = makeExercise({ id: "sq1", mp: "squat", sw: "squat_group", sw2: "squat_compound" });
  const compiledConfig = makeMinimalCompiledConfig({
    builder: {
      dayTemplates: [[{ slot: "A:squat", mp: "squat", sw: "squat_group", sw2: "squat_compound" }]],
      setsByDuration: { "50": { A: 5, B: 4, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      slotDefaults: {},
      excludeMovementClasses: ["conditioning"],
    },
  });

  const result = await buildProgramFromDefinition({
    inputs: makeInputs([cardio, squat], {}, ["bike1", "sq1"]),
    request: { days_per_week: 1 },
    compiledConfig,
  });

  assert.equal(result.program.days[0].blocks[0].ex_id, "sq1");
});
