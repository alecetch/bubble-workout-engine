import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../engine/runPipeline.js";

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
    program_generation_config_json: {
      total_weeks_default: 4,
      progression_by_rank_json: {
        beginner: { weekly_set_step: 0, max_extra_sets: 0 },
      },
    },
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
      program_generation_config_json: JSON.stringify({
        total_weeks_default: 3,
        progression_by_rank_json: {
          beginner: { weekly_set_step: 0, max_extra_sets: 0 },
        },
      }),
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
      program_generation_config_json: JSON.stringify({
        total_weeks_default: 4,
        progression_by_rank_json: {
          beginner: { weekly_set_step: 0, max_extra_sets: 0 },
        },
      }),
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
        program_generation_config_json: {
          total_weeks_default: 9,
          progression_by_rank_json: {
            beginner: { weekly_set_step: 0, max_extra_sets: 0 },
          },
        },
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
      program_generation_config_json: {
        total_weeks_default: 4,
        progression_by_rank_json: {
          beginner: { weekly_set_step: 0, max_extra_sets: 0 },
        },
      },
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

test("Step 03 falls back to Bubble configs when DB throws", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: {},
    db: makeDb({ throwOnConfigRows: true }),
  });

  assert.equal(out.debug.step3.source, "bubble");
  assert.equal(
    out.debug.step3.notes.some((n) => String(n).includes("Falling back to Bubble program_generation_config rows")),
    true,
  );
});

test("Step 03 falls back to Bubble configs when DB returns empty", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: {},
    db: makeDb({ configRows: [] }),
  });

  assert.equal(out.debug.step3.source, "bubble");
  assert.equal(
    out.debug.step3.notes.some((n) => String(n).includes("DB returned no active rows")),
    true,
  );
});

test("Step 03 falls back to hardcoded defaults when DB and Bubble are empty", async () => {
  const out = await runPipeline({
    inputs: makeInputs({ bubbleCfgRows: [] }),
    programType: "hypertrophy",
    request: {},
    db: makeDb({ configRows: [] }),
  });

  assert.equal(out.debug.step3.source, "hardcoded");
  assert.equal(
    out.debug.step3.notes.some((n) => String(n).includes("hardcoded progression defaults")),
    true,
  );
});

test("Step 05 receives DB-selected program_generation_config_json when DB path is used", async () => {
  const dbRows = [
    makeBubbleConfigRow({
      config_key: "db_cfg_exact",
      schema_version: 1,
      program_generation_config_json: {
        total_weeks_default: 9,
        progression_by_rank_json: {
          beginner: { weekly_set_step: 0, max_extra_sets: 0 },
        },
      },
    }),
  ];
  const out = await runPipeline({
    inputs: makeInputs({
      bubbleCfgRows: [
        makeBubbleConfigRow({
          config_key: "bubble_cfg",
          program_generation_config_json: { total_weeks_default: 4 },
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
