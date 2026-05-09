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

function makeSingleItemProgram(item) {
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
                ex_name: "Test Exercise",
                sets: 1,
                ...item,
              },
            ],
          },
        ],
      },
    ],
  };
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

test("applyNarration treats null priority as lower priority than explicit priority 1", async () => {
  const out = await applyNarration({
    program: makeProgram(),
    narrationTemplates: [
      {
        template_id: "segment_title_null_priority",
        scope: "segment",
        field: "SEGMENT_TITLE",
        purpose: "main",
        segment_type: "single",
        priority: null,
        text_pool_json: ["Null Priority Title"],
      },
      {
        template_id: "segment_title_priority_1",
        scope: "segment",
        field: "SEGMENT_TITLE",
        purpose: "main",
        segment_type: "single",
        priority: 1,
        text_pool_json: ["Explicit Priority 1 Title"],
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
  assert.equal(mainSingle?.narration?.title, "Explicit Priority 1 Title");
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

  // applyNarration unshifts a warmup segment, so find the amrap by type rather than index
  const amrapSeg = out.program?.days?.[0]?.segments?.find((s) => s.segment_type === "amrap");
  assert.equal(out.debug.ok, true);
  assert.equal(amrapSeg?.narration?.title ?? "", "Block B - AMRAP 3");
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

test("applyNarration suppresses exercise cues, load hint, and log prompt for interval-style items", async () => {
  const out = await applyNarration({
    program: {
      program_type: "hyrox",
      duration_mins: 40,
      days_per_week: 1,
      days: [
        {
          day_index: 1,
          day_focus: "simulation",
          segments: [
            {
              segment_index: 1,
              segment_type: "single",
              purpose: "main",
              rounds: 1,
              items: [
                {
                  ex_id: "run1",
                  ex_name: "Run Interval",
                  slot: "A:run_buy_in",
                  sets: 1,
                  reps_prescribed: "400-400 m",
                  reps_unit: "m",
                },
              ],
            },
          ],
        },
      ],
    },
    narrationTemplates: [
      {
        template_id: "cue_line",
        scope: "exercise",
        field: "CUE_LINE",
        priority: 1,
        text_pool_json: ["Cues: {CUE_1}. {CUE_2}."],
      },
      {
        template_id: "load_hint",
        scope: "exercise",
        field: "LOAD_HINT",
        priority: 1,
        text_pool_json: ["Add load only when every rep looks the same."],
      },
      {
        template_id: "logging_prompt",
        scope: "exercise",
        field: "LOGGING_PROMPT",
        priority: 1,
        text_pool_json: ["Track the top set and total reps."],
      },
      {
        template_id: "exercise_line",
        scope: "exercise",
        field: "EXERCISE_LINE",
        purpose: "main",
        priority: 1,
        text_pool_json: ["{EX_NAME}: {SETS} x {REP_RANGE}"],
      },
    ],
    narrationSource: "db",
    narrationTemplatesJson: null,
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: JSON.stringify({
      schema: "catalog_v3",
      ex: [{ id: "run1", mp: "locomotion", sw2: "run_interval" }],
    }),
    cooldownSeconds: 120,
  });

  const runItem = out.program?.days?.[0]?.segments?.find((seg) => seg.segment_type === "single")?.items?.[0];
  assert.equal(out.debug.ok, true);
  assert.equal(runItem?.narration?.cues ?? "", "");
  assert.equal(runItem?.narration?.load_hint ?? "", "");
  assert.equal(runItem?.narration?.log_prompt ?? "", "");
  assert.equal(runItem?.narration?.line ?? "", "Run Interval: 1 x 400-400 m");
});

test("applyNarration prefers catalogue coaching content over exercise templates when present", async () => {
  const out = await applyNarration({
    program: makeProgram(),
    narrationTemplates: [
      {
        template_id: "cue_line",
        scope: "exercise",
        field: "CUE_LINE",
        priority: 1,
        text_pool_json: ["Cues: {CUE_1}. {CUE_2}."],
      },
      {
        template_id: "load_hint",
        scope: "exercise",
        field: "LOAD_HINT",
        priority: 1,
        text_pool_json: ["Template load hint."],
      },
      {
        template_id: "logging_prompt",
        scope: "exercise",
        field: "LOGGING_PROMPT",
        priority: 1,
        text_pool_json: ["Template logging prompt."],
      },
      {
        template_id: "exercise_line",
        scope: "exercise",
        field: "EXERCISE_LINE",
        purpose: "main",
        priority: 1,
        text_pool_json: ["{EX_NAME}: {SETS} x {REP_RANGE}"],
      },
    ],
    narrationSource: "db",
    narrationTemplatesJson: null,
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: JSON.stringify({
      schema: "catalog_v3",
      ex: [
        {
          id: "ex1",
          wh: ["hips"],
          coaching_cues_json: ["Brace before you pull", "Push the floor away", "Keep the bar close"],
          load_guidance: "Add load gradually while keeping your hinge shape.",
          logging_guidance: "Log the heaviest successful set and total volume.",
        },
      ],
    }),
    cooldownSeconds: 120,
  });

  const item = out.program?.days?.[0]?.segments?.find((seg) => seg.segment_type === "single")?.items?.[0];
  assert.equal(out.debug.ok, true);
  assert.equal(item?.narration?.cues ?? "", "Brace before you pull · Push the floor away · Keep the bar close");
  assert.equal(item?.narration?.load_hint ?? "", "Add load gradually while keeping your hinge shape.");
  assert.equal(item?.narration?.log_prompt ?? "", "Log the heaviest successful set and total volume.");
  assert.equal(item?.narration_debug?.cues_source ?? "", "catalogue");
  assert.equal(item?.narration_debug?.load_hint_source ?? "", "catalogue");
  assert.equal(item?.narration_debug?.log_prompt_source ?? "", "catalogue");
});

test("applyNarration keeps catalogue coaching content for interval-style items while suppressing template fallback", async () => {
  const out = await applyNarration({
    program: {
      program_type: "hyrox",
      duration_mins: 40,
      days_per_week: 1,
      days: [
        {
          day_index: 1,
          day_focus: "simulation",
          segments: [
            {
              segment_index: 1,
              segment_type: "single",
              purpose: "main",
              rounds: 1,
              items: [
                {
                  ex_id: "run1",
                  ex_name: "Run Interval",
                  slot: "A:run_buy_in",
                  sets: 1,
                  reps_prescribed: "400 m",
                  reps_unit: "m",
                },
              ],
            },
          ],
        },
      ],
    },
    narrationTemplates: [
      {
        template_id: "cue_line",
        scope: "exercise",
        field: "CUE_LINE",
        priority: 1,
        text_pool_json: ["Cues: {CUE_1}. {CUE_2}."],
      },
      {
        template_id: "load_hint",
        scope: "exercise",
        field: "LOAD_HINT",
        priority: 1,
        text_pool_json: ["Template load hint."],
      },
      {
        template_id: "logging_prompt",
        scope: "exercise",
        field: "LOGGING_PROMPT",
        priority: 1,
        text_pool_json: ["Template logging prompt."],
      },
      {
        template_id: "exercise_line",
        scope: "exercise",
        field: "EXERCISE_LINE",
        purpose: "main",
        priority: 1,
        text_pool_json: ["{EX_NAME}: {SETS} x {REP_RANGE}"],
      },
    ],
    narrationSource: "db",
    narrationTemplatesJson: null,
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: JSON.stringify({
      schema: "catalog_v3",
      ex: [
        {
          id: "run1",
          mp: "locomotion",
          sw2: "run_interval",
          coaching_cues_json: ["Stay tall", "Short quick steps"],
          load_guidance: "Use a pace you can repeat smoothly.",
          logging_guidance: "Log distance and completion time.",
        },
      ],
    }),
    cooldownSeconds: 120,
  });

  const runItem = out.program?.days?.[0]?.segments?.find((seg) => seg.segment_type === "single")?.items?.[0];
  assert.equal(out.debug.ok, true);
  assert.equal(runItem?.narration?.cues ?? "", "Stay tall · Short quick steps");
  assert.equal(runItem?.narration?.load_hint ?? "", "Use a pace you can repeat smoothly.");
  assert.equal(runItem?.narration?.log_prompt ?? "", "Log distance and completion time.");
  assert.equal(runItem?.narration_debug?.cues_source ?? "", "catalogue");
  assert.equal(runItem?.narration_debug?.load_hint_source ?? "", "catalogue");
  assert.equal(runItem?.narration_debug?.log_prompt_source ?? "", "catalogue");
});

test("applyNarration PRESCRIPTION_TEXT appends reps for plain rep prescriptions", async () => {
  const out = await applyNarration({
    program: makeSingleItemProgram({ reps_prescribed: "15-20", reps_unit: "reps" }),
    narrationTemplatesJson: JSON.stringify([
      {
        template_id: "exercise_line_prescription_text",
        scope: "exercise",
        field: "EXERCISE_LINE",
        priority: 1,
        purpose: "main",
        text_pool_json: ["{EX_NAME}: {SETS} x {PRESCRIPTION_TEXT}"],
      },
    ]),
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  const item = out.program?.days?.[0]?.segments?.find((seg) => seg.segment_type === "single")?.items?.[0];
  assert.equal(out.debug.ok, true);
  assert.equal(item?.narration?.line?.includes("15-20 reps"), true);
});

test("applyNarration PRESCRIPTION_TEXT leaves meter prescriptions unchanged", async () => {
  const out = await applyNarration({
    program: makeSingleItemProgram({ reps_prescribed: "400 m", reps_unit: "m" }),
    narrationTemplatesJson: JSON.stringify([
      {
        template_id: "exercise_line_prescription_text",
        scope: "exercise",
        field: "EXERCISE_LINE",
        priority: 1,
        purpose: "main",
        text_pool_json: ["{EX_NAME}: {SETS} x {PRESCRIPTION_TEXT}"],
      },
    ]),
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  const item = out.program?.days?.[0]?.segments?.find((seg) => seg.segment_type === "single")?.items?.[0];
  assert.equal(out.debug.ok, true);
  assert.equal(item?.narration?.line?.includes("400 m"), true);
  assert.equal(item?.narration?.line?.includes("400 m reps"), false);
});

test("applyNarration PRESCRIPTION_TEXT leaves seconds prescriptions unchanged", async () => {
  const out = await applyNarration({
    program: makeSingleItemProgram({ reps_prescribed: "30 seconds", reps_unit: "seconds" }),
    narrationTemplatesJson: JSON.stringify([
      {
        template_id: "exercise_line_prescription_text",
        scope: "exercise",
        field: "EXERCISE_LINE",
        priority: 1,
        purpose: "main",
        text_pool_json: ["{EX_NAME}: {SETS} x {PRESCRIPTION_TEXT}"],
      },
    ]),
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  const item = out.program?.days?.[0]?.segments?.find((seg) => seg.segment_type === "single")?.items?.[0];
  assert.equal(out.debug.ok, true);
  assert.equal(item?.narration?.line?.includes("30 seconds"), true);
  assert.equal(item?.narration?.line?.includes("30 seconds reps"), false);
});

test("applyNarration REP_RANGE backward compatibility remains unchanged", async () => {
  const out = await applyNarration({
    program: makeSingleItemProgram({ reps_prescribed: "15-20", reps_unit: "reps" }),
    narrationTemplatesJson: JSON.stringify([
      {
        template_id: "exercise_line_rep_range",
        scope: "exercise",
        field: "EXERCISE_LINE",
        priority: 1,
        purpose: "main",
        text_pool_json: ["{EX_NAME}: {SETS} x {REP_RANGE}"],
      },
    ]),
    programGenerationConfigJson: makePgcJson(),
    fitnessRank: 1,
    programLength: 4,
    catalogJson: makeCatalogJson(),
    cooldownSeconds: 120,
  });

  const item = out.program?.days?.[0]?.segments?.find((seg) => seg.segment_type === "single")?.items?.[0];
  assert.equal(out.debug.ok, true);
  assert.equal(item?.narration?.line?.includes("15-20"), true);
  assert.equal(item?.narration?.line?.includes("15-20 reps"), false);
});
