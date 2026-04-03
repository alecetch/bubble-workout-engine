import test from "node:test";
import assert from "node:assert/strict";
import { applyNarration } from "../05_applyNarration.js";

function makeProgram() {
  return {
    program_type: "hypertrophy",
    duration_mins: 40,
    days_per_week: 1,
    days: [
      {
        day_index: 1,
        segments: [
          {
            segment_index: 1,
            segment_type: "single",
            purpose: "main",
            rounds: 1,
            items: [
              {
                ex_id: "ex1",
                ex_name: "Goblet Squat",
                sets: 3,
              },
            ],
          },
        ],
      },
    ],
  };
}

function makeCatalogJson() {
  return JSON.stringify({
    schema: "catalog_v3",
    ex: [{ id: "ex1", wh: ["hips"] }],
  });
}

function makePgcJson() {
  return JSON.stringify({
    total_weeks_default: 4,
    progression_by_rank_json: {
      beginner: { weekly_set_step: 0, max_extra_sets: 0 },
    },
    week_phase_config_json: {
      default_phase_sequence: ["BASELINE", "BUILD", "BUILD", "CONSOLIDATE"],
      last_week_mode: "consolidate",
    },
  });
}

function findMainSingleSegment(program) {
  const segments = program?.days?.[0]?.segments ?? [];
  return segments.find((seg) => seg?.segment_type === "single" && seg?.purpose === "main") ?? null;
}

test("applyNarration uses narrationTemplates array (DB rows) when provided", async () => {
  const out = await applyNarration({
    program: makeProgram(),
    narrationTemplates: [
      {
        template_id: "program_title_db",
        scope: "program",
        field: "PROGRAM_TITLE",
        priority: 1,
        text_pool_json: ["DB Program Title"],
      },
    ],
    narrationTemplatesJson: null,
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  assert.equal(out.debug.ok, true);
  assert.equal(out.debug.source, "db");
  assert.equal(typeof out.program?.narration?.program, "object");
  assert.equal(Object.prototype.hasOwnProperty.call(out.program?.days?.[0]?.narration ?? {}, "day_title"), true);
});

test("applyNarration preserves explicit narrationSource when narrationTemplates are provided", async () => {
  const out = await applyNarration({
    program: makeProgram(),
    narrationTemplates: [
      {
        template_id: "request_template",
        scope: "program",
        field: "PROGRAM_TITLE",
        priority: 1,
        text_pool_json: ["Request Program Title"],
      },
    ],
    narrationTemplatesJson: null,
    narrationSource: "request",
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  assert.equal(out.debug.ok, true);
  assert.equal(out.debug.source, "request");
});

test("applyNarration falls back to narrationTemplatesJson when narrationTemplates is empty", async () => {
  const out = await applyNarration({
    program: makeProgram(),
    narrationTemplates: [],
    narrationTemplatesJson: JSON.stringify([
      {
        template_id: "program_title_json",
        scope: "program",
        field: "PROGRAM_TITLE",
        priority: 1,
        text_pool_json: ["JSON Program Title"],
      },
    ]),
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  assert.equal(out.debug.ok, true);
  assert.equal(out.debug.source, "json");
  assert.equal(typeof out.program?.narration?.program, "object");
});

test("applyNarration returns ok:false when both narrationTemplates and narrationTemplatesJson are missing", async () => {
  const out = await applyNarration({
    program: makeProgram(),
    narrationTemplates: null,
    narrationTemplatesJson: null,
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  assert.equal(out.debug.ok, false);
  assert.equal(out.debug.source, "hardcoded");
  assert.match(String(out.debug.error), /No narration templates available/i);
});

test("applyNarration tolerates DB row fields with null values", async () => {
  const out = await applyNarration({
    program: makeProgram(),
    narrationTemplates: [
      {
        template_id: null,
        scope: null,
        field: null,
        purpose: null,
        segment_type: null,
        priority: null,
        text_pool_json: null,
      },
    ],
    narrationTemplatesJson: null,
    narrationSource: "db",
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  assert.equal(out.debug.ok, true);
  assert.equal(out.debug.source, "db");
  assert.equal(typeof out.program?.days?.[0]?.narration, "object");
});

test("applyNarration segment template scoring prefers purpose match over wildcard", async () => {
  const out = await applyNarration({
    program: makeProgram(),
    narrationTemplates: [
      {
        template_id: "segment_title_wildcard",
        scope: "segment",
        field: "SEGMENT_TITLE",
        purpose: "",
        segment_type: "single",
        priority: 1,
        text_pool_json: ["Wildcard Title"],
      },
      {
        template_id: "segment_title_main",
        scope: "segment",
        field: "SEGMENT_TITLE",
        purpose: "main",
        segment_type: "single",
        priority: 2,
        text_pool_json: ["Main-Specific Title"],
      },
    ],
    narrationSource: "db",
    narrationTemplatesJson: null,
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  const mainSingle = findMainSingleSegment(out.program);
  assert.equal(out.debug.ok, true);
  assert.equal(mainSingle?.narration?.title, "Main-Specific Title");
});

test("applyNarration segment template tie-break uses lower priority number", async () => {
  const out = await applyNarration({
    program: makeProgram(),
    narrationTemplates: [
      {
        template_id: "segment_title_p2",
        scope: "segment",
        field: "SEGMENT_TITLE",
        purpose: "main",
        segment_type: "single",
        priority: 2,
        text_pool_json: ["Priority 2 Title"],
      },
      {
        template_id: "segment_title_p1",
        scope: "segment",
        field: "SEGMENT_TITLE",
        purpose: "main",
        segment_type: "single",
        priority: 1,
        text_pool_json: ["Priority 1 Title"],
      },
    ],
    narrationSource: "db",
    narrationTemplatesJson: null,
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  const mainSingle = findMainSingleSegment(out.program);
  assert.equal(out.debug.ok, true);
  assert.equal(mainSingle?.narration?.title, "Priority 1 Title");
});

test("applyNarration exposes SEGMENT_INDEX and SEGMENT_LETTER tokens for segment titles", async () => {
  const out = await applyNarration({
    program: {
      program_type: "hyrox",
      duration_mins: 40,
      days_per_week: 1,
      days: [
        {
          day_index: 1,
          day_focus: "engine",
          segments: [
            {
              segment_index: 3,
              segment_type: "amrap",
              purpose: "main",
              rounds: 2,
              items: [
                {
                  ex_id: "ex1",
                  ex_name: "Ski Erg",
                  slot: "B:amrap_1",
                  sets: 1,
                },
              ],
            },
          ],
        },
      ],
    },
    narrationTemplates: [
      {
        template_id: "segment_title_tokens",
        scope: "segment",
        field: "SEGMENT_TITLE",
        purpose: "main",
        segment_type: "amrap",
        priority: 1,
        text_pool_json: ["Block {SEGMENT_LETTER} - AMRAP {SEGMENT_INDEX}"],
      },
    ],
    narrationSource: "db",
    narrationTemplatesJson: null,
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  const segTitle = out.program?.days?.[0]?.segments?.[0]?.narration?.title ?? "";
  assert.equal(out.debug.ok, true);
  assert.equal(segTitle, "Block B - AMRAP 3");
});

test("applyNarration prefers simulation-specific day title over generic fallback", async () => {
  const out = await applyNarration({
    program: {
      program_type: "hyrox",
      duration_mins: 40,
      days_per_week: 1,
      days: [
        {
          day_index: 1,
          day_focus: "simulation",
          segments: [],
        },
      ],
    },
    narrationTemplates: [
      {
        template_id: "day_title_generic",
        scope: "day",
        field: "DAY_TITLE",
        priority: 1,
        text_pool_json: ["Day {DAY_INDEX}: {DAY_FOCUS} Hypertrophy"],
      },
      {
        template_id: "day_title_simulation",
        scope: "day",
        field: "DAY_TITLE",
        priority: 1,
        applies_json: { program_type: "hyrox", day_focus: "simulation" },
        text_pool_json: ["Simulation Day"],
      },
    ],
    narrationSource: "db",
    narrationTemplatesJson: null,
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  const dayTitle = out.program?.days?.[0]?.narration?.day_title ?? "";
  assert.equal(out.debug.ok, true);
  assert.equal(dayTitle, "Simulation Day");
  assert.equal(dayTitle.includes("Hypertrophy"), false);
});
