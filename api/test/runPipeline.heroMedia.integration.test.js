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
        {
          id: "ex2",
          n: "DB Bench Press",
          sw: "push_horizontal_db",
          sw2: "push_horizontal_compound",
          mp: "push_horizontal",
          eq: ["dumbbell"],
          pref: ["strength_main", "hypertrophy_secondary"],
          den: 1,
          cx: 1,
          load: true,
          mc: "compound",
          tr: ["chest"],
          wh: ["shoulders"],
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

function makeInputs({ narrationJson = "[]", daysPerWeek = 1 } = {}) {
  return {
    clientProfile: {
      response: {
        duration_mins: 40,
        days_per_week: daysPerWeek,
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
          {
            id: "ex2",
            name: "DB Bench Press",
            swap_group_id_1: "push_horizontal_db",
            swap_group_id_2: "push_horizontal_compound",
            movement_pattern_primary: "push_horizontal",
            preferred_in_json: "[\"strength_main\",\"hypertrophy_secondary\"]",
            equipment_json: "[\"dumbbell\"]",
            density_rating: 1,
            complexity_rank: 1,
            is_loadable: true,
            movement_class: "compound",
            target_regions_json: "[\"chest\"]",
            warmup_hooks: "[\"shoulders\"]",
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
  mediaRows = [],
  throwOnMedia = false,
  narrationRows = [],
  throwOnNarration = false,
} = {}) {
  return {
    async query(sql) {
      if (sql.includes("FROM public.media_assets")) {
        if (throwOnMedia) throw new Error("media db unavailable");
        return { rows: mediaRows };
      }
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
  const fullPgcJson = {
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
        {
          day_key: "day2",
          focus: "upper",
          ordered_slots: [{ slot: "A:push_horizontal", sw2: "push_horizontal_compound", requirePref: "strength_main" }],
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
  };
  return {
    program_generation_config_json: JSON.stringify(fullPgcJson),
    ...overrides,
  };
}

function makeMediaRows() {
  return [
    {
      id: "program_hero",
      usage_scope: "program",
      day_type: "hypertrophy",
      focus_type: null,
      label: "Program Hero",
      image_key: "program/hero.jpg",
      image_url: "",
      sort_order: 1,
    },
    {
      id: "upper_hero",
      usage_scope: "program_day",
      day_type: "hypertrophy",
      focus_type: "upper_body",
      label: "Upper Hero",
      image_key: "days/upper.jpg",
      image_url: "",
      sort_order: 1,
    },
    {
      id: "lower_hero",
      usage_scope: "program_day",
      day_type: "hypertrophy",
      focus_type: "lower_body",
      label: "Lower Hero",
      image_key: "days/lower.jpg",
      image_url: "",
      sort_order: 2,
    },
    {
      id: "generic_hero",
      usage_scope: "program_day",
      day_type: "generic",
      focus_type: null,
      label: "Generic Hero",
      image_key: "days/generic.jpg",
      image_url: "",
      sort_order: 3,
    },
  ];
}

function collectAllItems(program) {
  const items = [];
  for (const day of program?.days ?? []) {
    for (const segment of day?.segments ?? []) {
      for (const item of segment?.items ?? []) {
        items.push(item);
      }
    }
  }
  return items;
}

test("program.hero_media_id is set from DB and step1 source is db", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({ mediaRows: makeMediaRows() }),
  });

  assert.equal(out.program.hero_media_id, "program_hero");
  assert.equal(out.debug.step1.hero_media_source, "db");
  const items = collectAllItems(out.program);
  assert.ok(items.length > 0, "expected generated exercise items");
  for (const item of items) {
    assert.ok(item.exercise_name || item.ex_name, "exercise display name should be populated");
  }
});

test("program.hero_media_id is null and step1 source is none when media DB is empty", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({ mediaRows: [] }),
  });

  assert.equal(out.program.hero_media_id, null);
  assert.equal(out.debug.step1.hero_media_source, "none");
});

test("pipeline continues when fetchActiveMediaAssets throws and step1 notes include error", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({ throwOnMedia: true }),
  });

  assert.equal(out.program.hero_media_id, null);
  assert.equal(
    out.debug.step1.notes.some((n) => String(n).includes("fetchActiveMediaAssets failed: media db unavailable")),
    true,
  );
});

test("week days have hero_media_id and day_focus_slug attached", async () => {
  const out = await runPipeline({
    inputs: makeInputs(),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({ mediaRows: makeMediaRows() }),
  });

  const weekDay = out.program.weeks?.[0]?.days?.[0];
  assert.equal(typeof weekDay?.hero_media_id, "string");
  assert.equal(typeof weekDay?.day_focus_slug, "string");
});

test("day with push slot uses upper_body hero and day with squat slot uses lower_body hero", async () => {
  const out = await runPipeline({
    inputs: makeInputs({ daysPerWeek: 2 }),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({ mediaRows: makeMediaRows() }),
  });

  const day1 = out.program.days.find((d) => d.day_index === 1);
  const day2 = out.program.days.find((d) => d.day_index === 2);

  assert.equal(day1?.day_focus_slug, "lower_body");
  assert.equal(day1?.hero_media_id, "lower_hero");
  assert.equal(day2?.day_focus_slug, "upper_body");
  assert.equal(day2?.hero_media_id, "upper_hero");
});

test("same inputs produce deterministic hero_media_id and step5 day hero source is populated", async () => {
  const db = makeDb({ mediaRows: makeMediaRows() });
  const outA = await runPipeline({
    inputs: makeInputs({ daysPerWeek: 2 }),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db,
  });
  const outB = await runPipeline({
    inputs: makeInputs({ daysPerWeek: 2 }),
    programType: "hypertrophy",
    request: makeBaseRequest(),
    db: makeDb({ mediaRows: makeMediaRows() }),
  });

  assert.equal(outA.program.hero_media_id, outB.program.hero_media_id);
  assert.equal(outA.debug.step5.day_hero_media_source, "db");
});
