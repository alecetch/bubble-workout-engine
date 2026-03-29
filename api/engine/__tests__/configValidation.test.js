import test from "node:test";
import assert from "node:assert/strict";
import { ConfigValidationError, validateCompiledConfig } from "../configValidation.js";

function makeValidConfig() {
  return {
    programType: "hypertrophy",
    schemaVersion: 1,
    configKey: "hypertrophy_default_v1",
    source: "db",
    builder: {
      dayTemplates: [
        {
          day_key: "day1",
          ordered_slots: [
            {
              slot: "A:squat",
              sw2: "squat_compound",
              requirePref: "strength_main",
              variability_policy: "high",
            },
            { slot: "B:lunge", mp: "lunge", sw: "quad_iso_unilateral" },
          ],
        },
      ],
      setsByDuration: { "50": { A: 4, B: 3, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      blockVariabilityDefaults: { A: "none", B: "med" },
      slotDefaults: {
        C: { requirePref: "hypertrophy_secondary" },
        D: { requirePref: "hypertrophy_secondary" },
      },
      excludeMovementClasses: ["cardio", "conditioning", "locomotion"],
    },
    segmentation: {
      blockSemantics: {
        A: { preferred_segment_type: "single", purpose: "main" },
        B: { preferred_segment_type: "superset", purpose: "secondary" },
        C: { preferred_segment_type: "giant_set", purpose: "accessory" },
        D: { preferred_segment_type: "single", purpose: "accessory" },
      },
    },
    progression: {
      progressionByRank: {},
      weekPhaseConfig: {},
      totalWeeksDefault: 4,
      applyToPurposes: ["main", "secondary", "accessory"],
    },
    raw: {
      programGenerationConfigRow: null,
      programGenerationConfigJson: {},
    },
  };
}

function expectValidationError(config) {
  try {
    validateCompiledConfig(config);
    assert.fail("Expected validateCompiledConfig to throw");
  } catch (err) {
    assert.ok(err instanceof ConfigValidationError, "Expected ConfigValidationError");
    return err;
  }
}

test("validateCompiledConfig does not throw for valid hypertrophy config", () => {
  const cfg = makeValidConfig();
  assert.doesNotThrow(() => validateCompiledConfig(cfg));
});

test("validateCompiledConfig catches missing programType", () => {
  const cfg = makeValidConfig();
  cfg.programType = "";
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("programType must be a non-empty string")));
});

test("validateCompiledConfig catches null builder", () => {
  const cfg = makeValidConfig();
  cfg.builder = null;
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("builder must be a non-null object")));
});

test("validateCompiledConfig catches empty dayTemplates", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates = [];
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("non-empty array")));
});

test("validateCompiledConfig catches slot block letter missing in segmentation.blockSemantics", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].ordered_slots.push({ slot: "E:test", sw: "arms" });
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("missing in segmentation.blockSemantics")));
});

test("validateCompiledConfig catches unknown selector_strategy", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].ordered_slots[0].selector_strategy = "wizard_mode";
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("selector_strategy must be one of")));
});

test("validateCompiledConfig catches unknown slot variability_policy", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].ordered_slots[0].variability_policy = "low";
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("variability_policy must be one of none|med|high")));
});

test("validateCompiledConfig catches invalid block variability default", () => {
  const cfg = makeValidConfig();
  cfg.builder.blockVariabilityDefaults.A = "low";
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes('builder.blockVariabilityDefaults["A"]')));
});

test("validateCompiledConfig accepts ordered simulation day fields", () => {
  const cfg = makeValidConfig();
  cfg.programType = "hyrox";
  cfg.builder.dayTemplates[0].is_ordered_simulation = true;
  cfg.builder.dayTemplates[0].ordered_slots[0] = {
    slot: "A:run_1",
    mp: "locomotion",
    sw2: "run_family",
    variability_policy: "none",
    requireHyroxRole: "run",
    station_index: 1,
    required_equipment_slugs: ["treadmill"],
    station_fallback_chain: [
      { station_index: 1, required_equipment_slugs: ["treadmill"] },
      { sw2: "run_family" },
      { mp: "locomotion" },
    ],
  };
  assert.doesNotThrow(() => validateCompiledConfig(cfg));
});

test("validateCompiledConfig catches invalid ordered simulation field shapes", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].is_ordered_simulation = "yes";
  cfg.builder.dayTemplates[0].ordered_slots[0].station_index = 0;
  cfg.builder.dayTemplates[0].ordered_slots[0].required_equipment_slugs = "treadmill";
  cfg.builder.dayTemplates[0].ordered_slots[0].station_fallback_chain = [{ station_index: "x" }];
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("is_ordered_simulation must be a boolean")));
  assert.ok(err.details.some((d) => d.includes("station_index must be a positive integer")));
  assert.ok(err.details.some((d) => d.includes("required_equipment_slugs must be an array")));
  assert.ok(err.details.some((d) => d.includes("station_fallback_chain[0].station_index")));
});

test("validateCompiledConfig catches invalid preferred_segment_type", () => {
  const cfg = makeValidConfig();
  cfg.segmentation.blockSemantics.A.preferred_segment_type = "tabata";
  const err = expectValidationError(cfg);
  assert.ok(
    err.details.some((d) => d.includes("must be one of single|superset|giant_set")),
  );
});

test("validateCompiledConfig collects multiple errors", () => {
  const cfg = makeValidConfig();
  cfg.programType = "";
  cfg.segmentation.blockSemantics.A.preferred_segment_type = "tabata";
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("programType must be a non-empty string")));
  assert.ok(
    err.details.some((d) => d.includes("must be one of single|superset|giant_set")),
  );
});
