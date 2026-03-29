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
  eq = [],
  hyroxRole = null,
  hyroxStationIndex = null,
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
    equipment_json: eq,
    density_rating: 1,
    complexity_rank: 1,
    target_regions_json: regions,
    warmup_hooks: [],
    hyrox_role: hyroxRole,
    hyrox_station_index: hyroxStationIndex,
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

function makeInputs(exercises = [], clientProfile = {}, allowedExerciseIds = null) {
  const inputs = {
    clientProfile: {
      response: {
        equipment_items_slugs: ["barbell"],
        minutes_per_session: 50,
        ...clientProfile,
      },
    },
    exercises: { response: { results: exercises } },
  };
  if (Array.isArray(allowedExerciseIds)) {
    inputs.allowed_exercise_ids = allowedExerciseIds;
  }
  return inputs;
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

test("med variability reuses within block, prefers later-block variation, and does not carry A-block stickiness into next day", async () => {
  const exercises = [
    makeExercise({
      id: "run1",
      name: "Outdoor Run",
      mp: "locomotion",
      sw: "locomotion",
      sw2: "run_family",
      mc: "compound",
    }),
    makeExercise({
      id: "run2",
      name: "Treadmill Run",
      mp: "locomotion",
      sw: "locomotion",
      sw2: "run_family",
      mc: "compound",
    }),
    makeExercise({
      id: "run3",
      name: "Curved Treadmill Run",
      mp: "locomotion",
      sw: "locomotion",
      sw2: "run_family",
      mc: "compound",
    }),
  ];

  const compiledConfig = makeMinimalCompiledConfig({
    builder: {
      dayTemplates: [
        [
          {
            slot: "A:run_one",
            mp: "locomotion",
            sw: "locomotion",
            sw2: "run_family",
            slot_family: "hyrox_run",
            variability_policy: "med",
          },
          {
            slot: "A:run_two",
            mp: "locomotion",
            sw: "locomotion",
            sw2: "run_family",
            slot_family: "hyrox_run",
            variability_policy: "med",
          },
          {
            slot: "B:run_three",
            mp: "locomotion",
            sw: "locomotion",
            sw2: "run_family",
            slot_family: "hyrox_run",
            variability_policy: "med",
          },
        ],
        [
          {
            slot: "A:run_four",
            mp: "locomotion",
            sw: "locomotion",
            sw2: "run_family",
            slot_family: "hyrox_run",
            variability_policy: "med",
          },
        ],
      ],
      setsByDuration: { "50": { A: 5, B: 4, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      slotDefaults: {},
      blockVariabilityDefaults: {},
      excludeMovementClasses: [],
    },
  });

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises, { fitness_rank: 1 }),
    request: { days_per_week: 2 },
    compiledConfig,
  });

  const day1Blocks = result.program.days[0].blocks;
  const day2Blocks = result.program.days[1].blocks;

  assert.equal(day1Blocks[0].ex_id, "run1");
  assert.equal(day1Blocks[1].ex_id, "run1");
  assert.equal(day1Blocks[2].ex_id, "run2");
  assert.equal(day2Blocks[0].ex_id, "run3");
});

test("ordered simulation day preserves slot order and resolves exact station matches first", async () => {
  const exercises = [
    makeExercise({
      id: "run_exact",
      name: "Treadmill Run",
      mp: "locomotion",
      sw: "locomotion",
      sw2: "run_family",
      eq: ["treadmill"],
      hyroxRole: "run",
      hyroxStationIndex: 1,
    }),
    makeExercise({
      id: "ski_exact",
      name: "Ski Erg",
      mp: "conditioning",
      sw: "conditioning",
      sw2: "ski_family",
      eq: ["ski_erg"],
      hyroxRole: "ski",
      hyroxStationIndex: 2,
    }),
    makeExercise({
      id: "row_exact",
      name: "Row Erg",
      mp: "conditioning",
      sw: "conditioning",
      sw2: "row_family",
      eq: ["row_erg"],
      hyroxRole: "row",
      hyroxStationIndex: 3,
    }),
  ];

  const compiledConfig = {
    ...makeMinimalCompiledConfig({ programType: "hyrox", configKey: "hyrox_sim_v1" }),
    builder: {
      dayTemplates: [
        {
          day_key: "sim_day_1",
          focus: "simulation",
          is_ordered_simulation: true,
          ordered_slots: [
            {
              slot: "A:run_1",
              mp: "locomotion",
              sw: "locomotion",
              sw2: "run_family",
              slot_family: "hyrox_run_1",
              variability_policy: "none",
              requireHyroxRole: "run",
              station_index: 1,
              station_fallback_chain: [
                { requireHyroxRole: "run", station_index: 1, required_equipment_slugs: ["treadmill"] },
                { sw2: "run_family" },
                { mp: "locomotion" },
              ],
            },
            {
              slot: "B:ski_1",
              mp: "conditioning",
              sw: "conditioning",
              sw2: "ski_family",
              slot_family: "hyrox_ski_1",
              variability_policy: "none",
              requireHyroxRole: "ski",
              station_index: 2,
              station_fallback_chain: [
                { requireHyroxRole: "ski", station_index: 2, required_equipment_slugs: ["ski_erg"] },
                { sw2: "ski_family" },
                { mp: "conditioning" },
              ],
            },
            {
              slot: "A:row_1",
              mp: "conditioning",
              sw: "conditioning",
              sw2: "row_family",
              slot_family: "hyrox_row_1",
              variability_policy: "none",
              requireHyroxRole: "row",
              station_index: 3,
              station_fallback_chain: [
                { requireHyroxRole: "row", station_index: 3, required_equipment_slugs: ["row_erg"] },
                { sw2: "row_family" },
                { mp: "conditioning" },
              ],
            },
          ],
        },
      ],
      setsByDuration: { "50": { A: 1, B: 1, C: 1, D: 1 } },
      blockBudget: { "50": 1 },
      slotDefaults: {},
      excludeMovementClasses: [],
    },
  };

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises, { fitness_rank: 1, equipment_items_slugs: ["treadmill", "ski_erg", "row_erg"] }),
    request: { days_per_week: 1 },
    compiledConfig,
  });

  const blocks = result.program.days[0].blocks;
  assert.deepEqual(
    blocks.map((block) => block.slot),
    ["A:run_1", "B:ski_1", "A:row_1"],
  );
  assert.deepEqual(
    blocks.map((block) => block.ex_id),
    ["run_exact", "ski_exact", "row_exact"],
  );
  assert.deepEqual(
    blocks.map((block) => block.simulation_resolution),
    ["exact", "exact", "exact"],
  );
});

test("ordered simulation falls back when exact equipment-specific option is unavailable", async () => {
  const exercises = [
    makeExercise({
      id: "run_family",
      name: "Outdoor Run",
      mp: "locomotion",
      sw: "locomotion",
      sw2: "run_family",
      eq: [],
      hyroxRole: "run",
    }),
    makeExercise({
      id: "run_exact",
      name: "Treadmill Run",
      mp: "locomotion",
      sw: "locomotion",
      sw2: "run_family",
      eq: ["treadmill"],
      hyroxRole: "run",
      hyroxStationIndex: 1,
    }),
  ];

  const compiledConfig = {
    ...makeMinimalCompiledConfig({ programType: "hyrox", configKey: "hyrox_sim_v1" }),
    builder: {
      dayTemplates: [
        {
          day_key: "sim_day_1",
          focus: "simulation",
          is_ordered_simulation: true,
          ordered_slots: [
            {
              slot: "A:run_1",
              mp: "locomotion",
              sw: "locomotion",
              sw2: "run_family",
              slot_family: "hyrox_run_1",
              variability_policy: "none",
              requireHyroxRole: "run",
              station_index: 1,
              station_fallback_chain: [
                { requireHyroxRole: "run", station_index: 1, required_equipment_slugs: ["treadmill"] },
                { sw2: "run_family" },
                { mp: "locomotion" },
              ],
            },
          ],
        },
      ],
      setsByDuration: { "50": { A: 1, B: 1, C: 1, D: 1 } },
      blockBudget: { "50": 1 },
      slotDefaults: {},
      excludeMovementClasses: [],
    },
  };

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises, { fitness_rank: 1 }, ["run_family"]),
    request: { days_per_week: 1 },
    compiledConfig,
  });

  const block = result.program.days[0].blocks[0];
  assert.equal(block.ex_id, "run_family");
  assert.equal(block.simulation_resolution, "family");
  assert.equal(block.simulation_fallback_index, 1);
});

test("ordered simulation with none stays stable across days and preserves degradation metadata", async () => {
  const exercises = [
    makeExercise({
      id: "run_family",
      name: "Outdoor Run",
      mp: "locomotion",
      sw: "locomotion",
      sw2: "run_family",
      eq: [],
      hyroxRole: "run",
    }),
    makeExercise({
      id: "run_exact",
      name: "Treadmill Run",
      mp: "locomotion",
      sw: "locomotion",
      sw2: "run_family",
      eq: ["treadmill"],
      hyroxRole: "run",
      hyroxStationIndex: 1,
    }),
  ];

  const simulationSlot = {
    slot: "A:run_1",
    mp: "locomotion",
    sw: "locomotion",
    sw2: "run_family",
    slot_family: "hyrox_run_1",
    variability_policy: "none",
    requireHyroxRole: "run",
    station_index: 1,
    station_fallback_chain: [
      { requireHyroxRole: "run", station_index: 1, required_equipment_slugs: ["treadmill"] },
      { sw2: "run_family" },
      { mp: "locomotion" },
    ],
  };

  const compiledConfig = {
    ...makeMinimalCompiledConfig({ programType: "hyrox", configKey: "hyrox_sim_v1" }),
    builder: {
      dayTemplates: [
        { day_key: "sim_day_1", focus: "simulation", is_ordered_simulation: true, ordered_slots: [simulationSlot] },
        { day_key: "sim_day_2", focus: "simulation", is_ordered_simulation: true, ordered_slots: [simulationSlot] },
      ],
      setsByDuration: { "50": { A: 1, B: 1, C: 1, D: 1 } },
      blockBudget: { "50": 1 },
      slotDefaults: {},
      excludeMovementClasses: [],
    },
  };

  const result = await buildProgramFromDefinition({
    inputs: makeInputs(exercises, { fitness_rank: 1 }, ["run_family"]),
    request: { days_per_week: 2 },
    compiledConfig,
  });

  const day1 = result.program.days[0].blocks[0];
  const day2 = result.program.days[1].blocks[0];
  assert.equal(day1.ex_id, "run_family");
  assert.equal(day2.ex_id, "run_family");
  assert.equal(day1.simulation_resolution, "family");
  assert.equal(day2.simulation_resolution, "family");
});

test("ordered simulation emits unresolvable blocks when fallback chain cannot resolve", async () => {
  const compiledConfig = {
    ...makeMinimalCompiledConfig({ programType: "hyrox", configKey: "hyrox_sim_v1" }),
    builder: {
      dayTemplates: [
        {
          day_key: "sim_day_1",
          focus: "simulation",
          is_ordered_simulation: true,
          ordered_slots: [
            {
              slot: "A:sled_push",
              mp: "conditioning",
              sw2: "sled_push_family",
              slot_family: "hyrox_sled_push",
              variability_policy: "none",
              requireHyroxRole: "sled_push",
              station_index: 4,
              station_fallback_chain: [
                { requireHyroxRole: "sled_push", station_index: 4, required_equipment_slugs: ["sled"] },
                { sw2: "sled_push_family" },
              ],
            },
          ],
        },
      ],
      setsByDuration: { "50": { A: 1, B: 1, C: 1, D: 1 } },
      blockBudget: { "50": 1 },
      slotDefaults: {},
      excludeMovementClasses: [],
    },
  };

  const result = await buildProgramFromDefinition({
    inputs: makeInputs([], { fitness_rank: 1 }, []),
    request: { days_per_week: 1 },
    compiledConfig,
  });

  const block = result.program.days[0].blocks[0];
  assert.equal(block.fill, "simulation_unresolvable");
  assert.equal(block.simulation_resolution, "unresolvable");
  assert.equal(result.debug.simulation_unresolvable, 1);
});
