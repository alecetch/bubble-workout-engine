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

test("validateCompiledConfig accepts lowercase slug focus values", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].focus = "simulation";
  assert.doesNotThrow(() => validateCompiledConfig(cfg));
});

test("validateCompiledConfig catches non-slug focus values", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].focus = "Simulation";
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes('.focus must match /^[a-z][a-z0-9_]*$/')));
});

test("validateCompiledConfig accepts day-level block_semantics override with unique focus", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates.push({
    day_key: "day2",
    focus: "engine",
    ordered_slots: [{ slot: "A:run_1", mp: "locomotion" }],
    block_semantics: {
      A: { preferred_segment_type: "amrap", purpose: "main" },
    },
  });
  assert.doesNotThrow(() => validateCompiledConfig(cfg));
});

test("validateCompiledConfig requires focus when day-level block_semantics override is present", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates.push({
    day_key: "day2",
    ordered_slots: [{ slot: "A:run_1", mp: "locomotion" }],
    block_semantics: {
      A: { preferred_segment_type: "amrap", purpose: "main" },
    },
  });
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes(".focus is required when block_semantics override is present")));
});

test("validateCompiledConfig catches duplicate focus for day-level block_semantics override", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates.push({
    day_key: "day2",
    focus: "engine",
    ordered_slots: [{ slot: "A:run_1", mp: "locomotion" }],
    block_semantics: {
      A: { preferred_segment_type: "amrap", purpose: "main" },
    },
  });
  cfg.builder.dayTemplates.push({
    day_key: "day3",
    focus: "engine",
    ordered_slots: [{ slot: "A:bike_1", mp: "locomotion" }],
    block_semantics: {
      A: { preferred_segment_type: "emom", purpose: "main" },
    },
  });
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("duplicates another day template focus used for block_semantics override")));
});

test("validateCompiledConfig catches invalid day-level block_semantics key", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].focus = "engine";
  cfg.builder.dayTemplates[0].block_semantics = {
    AA: { preferred_segment_type: "single", purpose: "main" },
  };
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes('block_semantics key "AA" must be a single uppercase block letter')));
});

test("validateCompiledConfig catches invalid day-level preferred_segment_type", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].focus = "engine";
  cfg.builder.dayTemplates[0].block_semantics = {
    A: { preferred_segment_type: "circuit", purpose: "main" },
  };
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes('block_semantics["A"].preferred_segment_type must be one of')));
});

test("validateCompiledConfig catches invalid day-level purpose", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].focus = "engine";
  cfg.builder.dayTemplates[0].block_semantics = {
    A: { preferred_segment_type: "single", purpose: "conditioning" },
  };
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes('block_semantics["A"].purpose must be one of main|secondary|accessory')));
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
  cfg.builder.dayTemplates[0].day_selection_mode = "benchmark_exactness";
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

test("validateCompiledConfig catches invalid day_selection_mode", () => {
  const cfg = makeValidConfig();
  cfg.builder.dayTemplates[0].day_selection_mode = "allow_week_repeats";
  const err = expectValidationError(cfg);
  assert.ok(err.details.some((d) => d.includes("day_selection_mode must be one of default|benchmark_exactness")));
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
