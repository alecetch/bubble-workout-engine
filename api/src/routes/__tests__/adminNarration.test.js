import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTemplates, validateTemplatePayload } from "../adminNarration.js";

function makeValidPayload() {
  return {
    template_id: "day_title_test",
    scope: "day",
    field: "DAY_TITLE",
    purpose: null,
    segment_type: null,
    priority: 1,
    text_pool_json: ["Title"],
    applies_json: null,
    is_active: true,
  };
}

test("validateTemplatePayload rejects an unknown field value", () => {
  const payload = makeValidPayload();
  payload.field = "DAY_SUBTITLE";
  const result = validateTemplatePayload(payload, { requireTemplateId: true });
  assert.equal(
    result.error,
    "field must be one of: CUE_LINE, DAY_GOAL, DAY_TITLE, EXERCISE_LINE, LOAD_HINT, LOGGING_PROMPT, PACE_NOTE, PROGRAM_SUMMARY, PROGRAM_TITLE, PROGRESSION_BLURB, RAMP_SETS_TEXT, SAFETY_BLURB, SEGMENT_EXECUTION, SEGMENT_INTENT, SEGMENT_TITLE, SETUP_NOTE, TIME_BUDGET_HINT, TRANSITION_NOTE, WARMUP_GENERAL_HEAT, WARMUP_TITLE, WEEK_FOCUS, WEEK_NOTES, WEEK_TITLE",
  );
});

test("validateTemplatePayload rejects an unknown purpose when provided", () => {
  const payload = makeValidPayload();
  payload.purpose = "warmup";
  const result = validateTemplatePayload(payload, { requireTemplateId: true });
  assert.equal(result.error, "purpose must be one of main, secondary, accessory");
});

test("validateTemplatePayload rejects an unknown segment_type when provided", () => {
  const payload = makeValidPayload();
  payload.segment_type = "circuit";
  const result = validateTemplatePayload(payload, { requireTemplateId: true });
  assert.equal(result.error, "segment_type must be one of single, superset, giant_set, amrap, emom");
});

test("validateTemplatePayload normalizes capitalized applies_json.program_type and day_focus", () => {
  const payload = makeValidPayload();
  payload.applies_json = { program_type: "Hyrox", day_focus: " Simulation " };
  const result = validateTemplatePayload(payload, { requireTemplateId: true });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value.applies_json, { program_type: "hyrox", day_focus: "simulation" });
});

test("validateTemplatePayload rejects unknown applies_json.program_type", () => {
  const payload = makeValidPayload();
  payload.applies_json = { program_type: "powerlifting" };
  const result = validateTemplatePayload(payload, { requireTemplateId: true });
  assert.equal(result.error, "applies_json.program_type must be one of: hypertrophy, strength, hyrox, conditioning");
});

test("validateTemplatePayload rejects lowercase applies_json.phase", () => {
  const payload = makeValidPayload();
  payload.applies_json = { phase: "baseline" };
  const result = validateTemplatePayload(payload, { requireTemplateId: true });
  assert.equal(result.error, "applies_json.phase must be one of: BASELINE, BUILD, PEAK, CONSOLIDATE, DELOAD");
});

test("validateTemplatePayload accepts applies_json.phase of BASELINE", () => {
  const payload = makeValidPayload();
  payload.applies_json = { phase: "BASELINE" };
  const result = validateTemplatePayload(payload, { requireTemplateId: true });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value.applies_json, { phase: "BASELINE" });
});

test("normalizeTemplates lowercases applies_program_type and applies_day_focus read from the DB", () => {
  const [template] = normalizeTemplates([
    {
      template_id: "simulation_title",
      scope: "day",
      field: "DAY_TITLE",
      purpose: null,
      segment_type: null,
      priority: 1,
      text_pool_json: ["Simulation Day"],
      applies_json: {
        program_type: "Hyrox",
        day_focus: "Simulation",
        phase: "BASELINE",
      },
    },
  ]);

  assert.equal(template.applies_program_type, "hyrox");
  assert.equal(template.applies_day_focus, "simulation");
  assert.equal(template.applies_phase, "BASELINE");
});
