import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../engine/runPipeline.js";

function makeCatalogBuild({ narrationJson = "[]" } = {}) {
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
    rep_rules_json: JSON.stringify([
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
    narration_json: narrationJson,
  };
}

function makeInputs({ narrationJson = "[]" } = {}) {
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
          results: [makeCatalogBuild({ narrationJson })],
        },
      },
      genConfigs: {
        response: {
          results: [{ program_generation_config_json: "{}" }],
        },
      },
    },
  };
}

function makeDb({
  narrationRows = [],
  throwOnNarration = false,
  queryLog = [],
} = {}) {
  return {
    async query(sql) {
      queryLog.push(sql);
      if (sql.includes("FROM public.narration_template")) {
        if (throwOnNarration) throw new Error("narration db unavailable");
        return { rows: narrationRows };
      }
      if (sql.includes("FROM program_rep_rule")) {
        return { rows: [] };
      }
      if (sql.includes("FROM program_generation_config")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in test db: ${sql}`);
    },
  };
}

function makeBaseRequest(overrides = {}) {
  return {
    program_generation_config_json: JSON.stringify({
      total_weeks_default: 4,
      progression_by_rank_json: {
        beginner: { weekly_set_step: 0, max_extra_sets: 0 },
      },
    }),
    ...overrides,
  };
}

test("Step 5 uses request narration_templates_json override when non-empty", async () => {
  const queryLog = [];
  const db = makeDb({ narrationRows: [{ template_id: "db_template" }], queryLog });

  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest({
      narration_templates_json: JSON.stringify([
        {
          template_id: "request_template",
          scope: "program",
          field: "PROGRAM_TITLE",
          priority: 1,
          text_pool_json: ["Request Program Title"],
        },
      ]),
    }),
    db,
  });

  assert.equal(out.debug.step5.source, "request");
  assert.equal(Array.isArray(out.debug.step5.notes), false);
  assert.equal(queryLog.some((sql) => sql.includes("FROM public.narration_template")), false);
});

test("Step 5 uses DB narration templates when DB returns active rows", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({
      narrationRows: [
        {
          template_id: "db_template",
          scope: "program",
          field: "PROGRAM_TITLE",
          priority: 1,
          text_pool_json: ["DB Program Title"],
          applies_json: null,
        },
      ],
    }),
  });

  assert.equal(out.debug.step5.source, "db");
});

test("Step 5 falls back to CatalogBuild narration_json when DB returns empty", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({ narrationRows: [] }),
  });

  assert.equal(out.debug.step5.source, "json");
  assert.equal(
    out.debug.step5.notes.some(
      (n) => String(n).includes("Falling back") && String(n).toLowerCase().includes("narration"),
    ),
    true,
  );
});

test("Step 5 falls back to CatalogBuild narration_json when DB fetch throws", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({ throwOnNarration: true }),
  });

  assert.equal(out.debug.step5.source, "json");
  assert.equal(
    out.debug.step5.notes.some(
      (n) =>
        String(n).includes("Falling back to CatalogBuild narration_json (DB fetch failed: narration db unavailable)"),
    ),
    true,
  );
});

test("Step 5 uses hardcoded empty fallback when DB is empty and CatalogBuild narration_json is missing", async () => {
  const out = await runPipeline({
    inputs: makeInputs({ narrationJson: null }),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({ narrationRows: [] }),
  });

  assert.equal(out.debug.step5.source, "hardcoded");
  assert.equal(
    out.debug.step5.notes.some((n) => String(n).includes("No narration templates available")),
    true,
  );
});
