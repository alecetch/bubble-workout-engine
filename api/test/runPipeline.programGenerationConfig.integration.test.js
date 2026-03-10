import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../engine/runPipeline.js";

function makeFullProgramGenerationConfigJson(overrides = {}) {
  return {
    total_weeks_default: 4,
    progression_by_rank_json: {
      beginner: { weekly_set_step: 0, max_extra_sets: 0 },
    },
    builder: {
      day_templates: [
        {
          day_key: "day1",
          focus: "lower",
          ordered_slots: [{ slot: "A:squat", sw2: "squat_compound", requirePref: "strength_main" }],
        },
      ],
      sets_by_duration: {
        "40": { A: 3, B: 3, C: 2, D: 2 },
        "50": { A: 4, B: 3, C: 3, D: 2 },
        "60": { A: 5, B: 4, C: 3, D: 3 },
      },
      block_budget: { "40": 4, "50": 5, "60": 6 },
      slot_defaults: {
        C: { requirePref: "hypertrophy_secondary" },
        D: { requirePref: "hypertrophy_secondary" },
      },
      exclude_movement_classes: ["cardio", "conditioning", "locomotion"],
    },
    segmentation: {
      block_semantics: {
        A: { preferred_segment_type: "single", purpose: "main" },
        B: { preferred_segment_type: "superset", purpose: "secondary" },
        C: { preferred_segment_type: "giant_set", purpose: "accessory" },
        D: { preferred_segment_type: "single", purpose: "accessory" },
      },
    },
    progression: {
      apply_to_purposes: ["main", "secondary", "accessory"],
    },
    ...overrides,
  };
}

function makeCatalogBuild({ repRulesJson } = {}) {
  return {
    version: "v3",
    catalog_json: JSON.stringify({
      schema: "catalog_v3",
      ex: [
        {
          id: "ex1",
          n: "Goblet Squat",
          sw: "quad_iso_squat",
          sw2: "squat_compound",
          mp: "squat",
          eq: ["dumbbell"],
          pref: ["strength_main"],
          den: 1,
          cx: 1,
          load: true,
          mc: "compound",
          tr: ["quads"],
          wh: ["hips"],
        },
      ],
    }),
    rep_rules_json:
      repRulesJson ??
      JSON.stringify([
        {
          rule_id: "json_rule",
          is_active: true,
          priority: 1,
          program_type: "hypertrophy",
          segment_type: "single",
          purpose: "main",
          reps_unit: "reps",
          rep_low: 8,
          rep_high: 10,
          rir_target: 2,
          tempo_eccentric: 2,
          tempo_pause_bottom: 0,
          tempo_concentric: 2,
          tempo_pause_top: 0,
          rest_after_set_sec: 75,
        },
      ]),
    narration_json: JSON.stringify([
      {
        template_id: "program_title",
        scope: "program",
        field: "PROGRAM_TITLE",
        priority: 1,
        text_pool_json: "[\"Hypertrophy Plan\"]",
      },
    ]),
  };
}

function makeBubbleConfigRow(overrides = {}) {
  return {
    config_key: "bubble_cfg",
    is_active: true,
    program_type: "hypertrophy",
    schema_version: 1,
    total_weeks_default: 4,
    progression_by_rank_json: {
      beginner: { weekly_set_step: 0, max_extra_sets: 0 },
      intermediate: { weekly_set_step: 1, max_extra_sets: 2 },
      advanced: { weekly_set_step: 1, max_extra_sets: 3 },
      elite: { weekly_set_step: 1, max_extra_sets: 4 },
    },
    program_generation_config_json: makeFullProgramGenerationConfigJson(),
    ...overrides,
  };
}

function makeInputs({
  bubbleCfgRows = [makeBubbleConfigRow()],
  repRulesJson,
} = {}) {
  return {
    clientProfile: {
      response: {
        duration_mins: 40,
        days_per_week: 1,
        fitness_rank: 1,
        preferred_days: "Mon",
      },
    },
    exercises: {
      response: {
        results: [
          {
            id: "ex1",
            name: "Goblet Squat",
            swap_group_id_1: "quad_iso_squat",
            swap_group_id_2: "squat_compound",
            movement_pattern_primary: "squat",
            preferred_in_json: "[\"strength_main\"]",
            equipment_json: "[\"dumbbell\"]",
            density_rating: 1,
            complexity_rank: 1,
            is_loadable: true,
            movement_class: "compound",
            target_regions_json: "[\"quads\"]",
            warmup_hooks: "[\"hips\"]",
          },
        ],
      },
    },
    configs: {
      catalogBuilds: {
        response: {
          results: [makeCatalogBuild({ repRulesJson })],
        },
      },
      genConfigs: {
        response: {
          results: bubbleCfgRows,
        },
      },
    },
  };
}

function makeDb({
  configByKeyRow = null,
  configRows = [],
  throwOnConfigRows = false,
  repRuleRows = [],
} = {}) {
  return {
    async query(sql, params = []) {
      if (sql.includes("FROM program_generation_config")) {
        if (sql.includes("config_key = $1")) {
          if (configByKeyRow) return { rows: [configByKeyRow] };
          return { rows: [] };
        }
        if (throwOnConfigRows) throw new Error("pgc query failed");
        return { rows: configRows };
      }
      if (sql.includes("FROM program_rep_rule")) {
        return { rows: repRuleRows };
      }
      throw new Error(`Unexpected SQL in test db: ${sql}`);
    },
  };
}

function firstSingleItemSetsForWeek(program, weekZeroIndex) {
  const day = program?.weeks?.[weekZeroIndex]?.days?.[0];
  const singleSeg = (day?.segments ?? []).find((seg) => seg?.segment_type === "single");
  return singleSeg?.items?.[0]?.sets ?? null;
}

test("Step 03 uses request.program_generation_config_json first", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: {
      program_generation_config_json: JSON.stringify(
        makeFullProgramGenerationConfigJson({
          total_weeks_default: 3,
          progression_by_rank_json: {
            beginner: { weekly_set_step: 0, max_extra_sets: 0 },
          },
        }),
      ),
    },
    db: makeDb(),
  });

  assert.equal(out.debug.step3.source, "request");
});

test("Step 03 request progression_by_rank_json overrides nested JSON progression", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: {
      fitness_rank: 1,
      progression_by_rank_json: {
        beginner: { weekly_set_step: 1, max_extra_sets: 1 },
      },
      program_generation_config_json: JSON.stringify(
        makeFullProgramGenerationConfigJson({
          total_weeks_default: 4,
          progression_by_rank_json: {
            beginner: { weekly_set_step: 0, max_extra_sets: 0 },
          },
        }),
      ),
    },
    db: makeDb(),
  });

  const week1Sets = firstSingleItemSetsForWeek(out.program, 0);
  const week2Sets = firstSingleItemSetsForWeek(out.program, 1);
  assert.equal(out.debug.step3.source, "request");
  assert.equal(week2Sets > week1Sets, true);
});

test("Step 03 config_key path uses DB row when found", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: { config_key: "cfg_key_1" },
    db: makeDb({
      configByKeyRow: makeBubbleConfigRow({
        config_key: "cfg_key_1",
        program_generation_config_json: makeFullProgramGenerationConfigJson({
          total_weeks_default: 9,
          progression_by_rank_json: {
            beginner: { weekly_set_step: 0, max_extra_sets: 0 },
          },
        }),
      }),
    }),
  });

  assert.equal(out.debug.step3.source, "db");
});

test("Step 03 config_key path fails fast when missing/inactive", async () => {
  await assert.rejects(
    () =>
      runPipeline({
        inputs: makeInputs(),
        programType: "hypertrophy",
        request: { config_key: "missing_key" },
        db: makeDb({ configByKeyRow: null }),
      }),
    /No active ProgramGenerationConfig found for config_key=missing_key/,
  );
});

test("Step 03 uses DB rows by program_type+schema_version when available", async () => {
  const dbRows = [
    makeBubbleConfigRow({ config_key: "exact_schema", schema_version: 1 }),
    makeBubbleConfigRow({ config_key: "null_schema", schema_version: null }),
  ];
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: {},
    db: makeDb({ configRows: dbRows }),
  });

  assert.equal(out.debug.step3.source, "db");
  assert.equal(out.debug.step3.config_key, "exact_schema");
});

test("Step 03 DB progression uses progression_by_rank_json column over nested JSON", async () => {
  const dbRows = [
    makeBubbleConfigRow({
      config_key: "db_column_wins",
      schema_version: 1,
      progression_by_rank_json: {
        beginner: { weekly_set_step: 1, max_extra_sets: 1 },
      },
      program_generation_config_json: makeFullProgramGenerationConfigJson({
        total_weeks_default: 4,
        progression_by_rank_json: {
          beginner: { weekly_set_step: 0, max_extra_sets: 0 },
        },
      }),
    }),
  ];

  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: { fitness_rank: 1 },
    db: makeDb({ configRows: dbRows }),
  });

  const week1Sets = firstSingleItemSetsForWeek(out.program, 0);
  const week2Sets = firstSingleItemSetsForWeek(out.program, 1);
  assert.equal(out.debug.step3.source, "db");
  assert.equal(out.debug.step3.config_key, "db_column_wins");
  assert.equal(week2Sets > week1Sets, true);
});

test("Step 03 fails fast when DB config lookup throws and no request override is provided", async () => {
  await assert.rejects(
    () =>
      runPipeline({
        inputs: makeInputs(),
        programType: "hypertrophy",
        request: {},
        db: makeDb({ throwOnConfigRows: true }),
      }),
    /Compiled config validation failed/,
  );
});

test("Step 03 fails fast when DB config lookup returns empty and no request override is provided", async () => {
  await assert.rejects(
    () =>
      runPipeline({
        inputs: makeInputs(),
        programType: "hypertrophy",
        request: {},
        db: makeDb({ configRows: [] }),
      }),
    /Compiled config validation failed/,
  );
});

test("Step 03 fails fast when no config sources are available", async () => {
  await assert.rejects(
    () =>
      runPipeline({
        inputs: makeInputs({ bubbleCfgRows: [] }),
        programType: "hypertrophy",
        request: {},
        db: makeDb({ configRows: [] }),
      }),
    /Compiled config validation failed/,
  );
});

test("Step 05 receives DB-selected program_generation_config_json when DB path is used", async () => {
  const dbRows = [
    makeBubbleConfigRow({
      config_key: "db_cfg_exact",
      schema_version: 1,
      program_generation_config_json: makeFullProgramGenerationConfigJson({
        total_weeks_default: 9,
        progression_by_rank_json: {
          beginner: { weekly_set_step: 0, max_extra_sets: 0 },
        },
      }),
    }),
  ];
  const out = await runPipeline({
    inputs: makeInputs({
      bubbleCfgRows: [
        makeBubbleConfigRow({
          config_key: "bubble_cfg",
          program_generation_config_json: makeFullProgramGenerationConfigJson({
            total_weeks_default: 4,
          }),
        }),
      ],
    }),
    programType: "hypertrophy",
    request: {},
    db: makeDb({ configRows: dbRows }),
  });

  assert.equal(out.debug.step3.source, "db");
  assert.equal(out.debug.step3.config_key, "db_cfg_exact");
  assert.equal(out.debug.step5.cfg.total_weeks_default, 9);
});

// ---------------------------------------------------------------------------
// Sets-vs-config contract tests
// ---------------------------------------------------------------------------

// sets_by_duration matching the real hypertrophy_default_v1 values
const SETS_BY_DURATION = {
  "40": { A: 3, B: 3, C: 2, D: 2 },
  "50": { A: 4, B: 3, C: 3, D: 2 },
  "60": { A: 5, B: 4, C: 3, D: 3 },
};

function makeExercise(id, sw2) {
  return {
    id,
    name: id,
    swap_group_id_1: `${sw2}_sw`,
    swap_group_id_2: sw2,
    movement_pattern_primary: id,
    preferred_in_json: "[]",
    equipment_json: JSON.stringify(["barbell"]),
    density_rating: 1,
    complexity_rank: 1,
    is_loadable: true,
    movement_class: "compound",
    target_regions_json: JSON.stringify(["legs"]),
    warmup_hooks: JSON.stringify([]),
  };
}

function makeSetsContractPgcJson(slots) {
  return {
    total_weeks_default: 4,
    progression_by_rank_json: {
      beginner: { weekly_set_step: 0, max_extra_sets: 0 },
    },
    builder: {
      day_templates: [{ day_key: "day1", focus: "lower", ordered_slots: slots }],
      sets_by_duration: SETS_BY_DURATION,
      block_budget: { "40": 4, "50": 5, "60": 6 },
      slot_defaults: {},
      exclude_movement_classes: ["cardio", "conditioning", "locomotion"],
    },
    segmentation: {
      block_semantics: {
        A: { preferred_segment_type: "single", purpose: "main" },
        B: { preferred_segment_type: "single", purpose: "secondary" },
        C: { preferred_segment_type: "single", purpose: "accessory" },
        D: { preferred_segment_type: "single", purpose: "accessory" },
      },
    },
    progression: { apply_to_purposes: ["main", "secondary", "accessory"] },
  };
}

function makeSetsContractInputs(exercises, durationMins) {
  return {
    clientProfile: {
      response: { duration_mins: durationMins, days_per_week: 1, fitness_rank: 1, preferred_days: "Mon" },
    },
    exercises: { response: { results: exercises } },
    configs: {
      catalogBuilds: { response: { results: [makeCatalogBuild()] } },
      genConfigs: { response: { results: [] } },
    },
  };
}

function getSetsForSlot(program, slot) {
  const day = program?.weeks?.[0]?.days?.[0];
  for (const seg of day?.segments ?? []) {
    for (const item of seg?.items ?? []) {
      if (item.slot === slot) return item.sets;
    }
  }
  return null;
}

test("sets match sets_by_duration config for each block when all slots fill — 60 min", async () => {
  const slots = [
    { slot: "A:squat", sw2: "squat_compound" },
    { slot: "B:lunge", sw2: "lunge_compound" },
    { slot: "C:quad", sw2: "quad_iso" },
    { slot: "D:core", sw2: "core_iso" },
  ];
  const exercises = [
    makeExercise("ex_a", "squat_compound"),
    makeExercise("ex_b", "lunge_compound"),
    makeExercise("ex_c", "quad_iso"),
    makeExercise("ex_d", "core_iso"),
  ];

  const out = await runPipeline({
    inputs: makeSetsContractInputs(exercises, 60),
    programType: "hypertrophy",
    request: {
      duration_mins: 60,
      days_per_week: 1,
      fitness_rank: 1,
      program_generation_config_json: JSON.stringify(makeSetsContractPgcJson(slots)),
    },
    db: makeDb(),
  });

  // Week 1 sets must match sets_by_duration["60"] exactly — no fill inflation
  assert.equal(getSetsForSlot(out.program, "A:squat"), 5, "Block A should have 5 sets at 60 min");
  assert.equal(getSetsForSlot(out.program, "B:lunge"), 4, "Block B should have 4 sets at 60 min");
  assert.equal(getSetsForSlot(out.program, "C:quad"), 3, "Block C should have 3 sets at 60 min");
  assert.equal(getSetsForSlot(out.program, "D:core"), 3, "Block D should have 3 sets at 60 min");
});

test("sets match sets_by_duration config for each block when all slots fill — 40 min", async () => {
  const slots = [
    { slot: "A:squat", sw2: "squat_compound" },
    { slot: "B:lunge", sw2: "lunge_compound" },
    { slot: "C:quad", sw2: "quad_iso" },
  ];
  const exercises = [
    makeExercise("ex_a", "squat_compound"),
    makeExercise("ex_b", "lunge_compound"),
    makeExercise("ex_c", "quad_iso"),
  ];

  const out = await runPipeline({
    inputs: makeSetsContractInputs(exercises, 40),
    programType: "hypertrophy",
    request: {
      duration_mins: 40,
      days_per_week: 1,
      fitness_rank: 1,
      program_generation_config_json: JSON.stringify(makeSetsContractPgcJson(slots)),
    },
    db: makeDb(),
  });

  assert.equal(getSetsForSlot(out.program, "A:squat"), 3, "Block A should have 3 sets at 40 min");
  assert.equal(getSetsForSlot(out.program, "B:lunge"), 3, "Block B should have 3 sets at 40 min");
  assert.equal(getSetsForSlot(out.program, "C:quad"), 2, "Block C should have 2 sets at 40 min");
});

test("unfillable slot adds exactly +1 set to fill_fallback_slot target", async () => {
  // C:quad can't fill (no matching exercise) → fill block targets B:lunge → B gets +1
  const slots = [
    { slot: "A:squat", sw2: "squat_compound" },
    { slot: "B:lunge", sw2: "lunge_compound" },
    { slot: "C:quad", sw2: "quad_iso", fill_fallback_slot: "B:lunge" },
  ];
  const exercises = [
    makeExercise("ex_a", "squat_compound"),
    makeExercise("ex_b", "lunge_compound"),
    // no ex_c — C:quad will fail to fill
  ];

  const inputs = {
    clientProfile: {
      response: { duration_mins: 60, days_per_week: 1, fitness_rank: 1, preferred_days: "Mon" },
    },
    exercises: { response: { results: exercises } },
    configs: {
      catalogBuilds: { response: { results: [makeCatalogBuild()] } },
      genConfigs: { response: { results: [] } },
    },
  };

  const out = await runPipeline({
    inputs,
    programType: "hypertrophy",
    request: {
      duration_mins: 60,
      days_per_week: 1,
      fitness_rank: 1,
      program_generation_config_json: JSON.stringify(makeSetsContractPgcJson(slots)),
    },
    db: makeDb(),
  });

  // A stays at 5; B gets config(4) + 1 fill = 5 (applied exactly once by step 02, not twice)
  assert.equal(getSetsForSlot(out.program, "A:squat"), 5, "Block A unaffected by fill");
  assert.equal(getSetsForSlot(out.program, "B:lunge"), 5, "Block B = config(4) + 1 fill (not +2)");
});
