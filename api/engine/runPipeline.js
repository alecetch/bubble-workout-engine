// api/engine/runPipeline.js
//
// DROP-IN REPLACEMENT
// Steps:
// 01 build -> 02 segment -> 03 progression -> 04 rep rules -> 05 narration -> 06 emitter (rows)

import { buildBasicHypertrophyProgramStep } from "./steps/01_buildBasicHypertrophyProgram.js";
import { segmentHypertrophyProgram } from "./steps/02_segmentHypertrophy.js";
import { applyProgression } from "./steps/03_applyProgression.js";
import { applyRepRules } from "./steps/04_applyRepRules.js";
import { applyNarration } from "./steps/05_applyNarration.js";
import { emitPlanRows } from "./steps/06_emitPlan.js";

function pickCatalogBuildV3(inputs) {
  const catalogBuilds = inputs?.configs?.catalogBuilds?.response?.results ?? [];
  const v3 = catalogBuilds.find((b) => String(b?.version).toLowerCase() === "v3");
  return v3 || catalogBuilds[0] || null;
}

export async function runPipeline({ inputs, programType, request }) {
  if (programType !== "hypertrophy") {
    throw new Error(`Unsupported programType: ${programType}`);
  }

  // Step 1
  const step1 = await buildBasicHypertrophyProgramStep({ inputs, request });

  // Step 2
  const step2 = await segmentHypertrophyProgram({
    program: step1.program,
    default_single_rounds: request?.default_single_rounds ?? 1,
    default_superset_rounds: request?.default_superset_rounds ?? 1,
    default_giant_rounds: request?.default_giant_rounds ?? 1,
  });

  // Step 3
  const clientProfile = inputs?.clientProfile?.response ?? {};
  const fitnessRank =
    request?.fitness_rank ??
    clientProfile.fitness_rank ??
    clientProfile.min_fitness_rank ??
    1;

  const programLength =
    request?.program_length ??
    clientProfile.program_length ??
    null;

  const cfgRows = inputs?.configs?.genConfigs?.response?.results ?? [];

  const step3 = await applyProgression({
    program: step2.program,
    programType: "hypertrophy",
    fitnessRank,
    programLength,
    programGenerationConfigs: cfgRows,
    schemaVersion: 1,
  });

  // Step 4 (rep rules)
  const build = pickCatalogBuildV3(inputs);
  if (!build) throw new Error("No CatalogBuild found (configs.catalogBuilds).");

  const step4 = await applyRepRules({
    program: step3.program,
    catalogJson: build.catalog_json,
    repRulesJson: build.rep_rules_json,
  });

  // Step 5 (narration)
  // narrationTemplatesJson: CatalogBuild.v3 narration_json (you said stored in CatalogBuild)
  // programGenerationConfigJson: ProgramGenerationConfig row (hypertrophy_default_v1; schema_version=1)
  const pgcRow = (inputs?.configs?.genConfigs?.response?.results ?? [])[0] ?? {};
  // If your ProgramGenerationConfig JSON is stored differently, swap this field accordingly:
  const programGenerationConfigJson =
    request?.program_generation_config_json ??
    pgcRow?.program_generation_config_json ??
    pgcRow?.config_json ??
    null;

  const step5 = await applyNarration({
    program: step4.program,
    narrationTemplatesJson: build.narration_json,
    programGenerationConfigJson,
    fitnessRank,
    programLength,
    catalogJson: build.catalog_json,
    cooldownSeconds: request?.cooldown_seconds ?? 120,
  });

  // Step 6 (emitter rows)
  // Inputs:
  // - anchor_day_ms: "Current date/time rounded down to day" (you can pass it in request)
  // - preferred_days_json: clientProfile.preferred_days (comma string)
  const step6 = await emitPlanRows({
    program: step5.program,
    catalogJson: build.catalog_json,

    // accept either; emitter supports both
    anchorDayMs: request?.anchor_day_ms ?? request?.anchor_date_ms,
    preferredDaysJson: request?.preferred_days_json ?? clientProfile.preferred_days,

    // optional overrides
    programLength: request?.program_length, // if omitted, uses narration weeks length

    warmupSeconds: request?.warmup_seconds ?? 300,
    cooldownSeconds: request?.cooldown_seconds ?? 120,

    // optional timing knobs if you want to expose them:
    timing_default_reps_fallback: request?.timing_default_reps_fallback,
    timing_default_seconds_per_rep: request?.timing_default_seconds_per_rep,
    timing_set_overhead_sec: request?.timing_set_overhead_sec,
    timing_between_exercise_transition_sec: request?.timing_between_exercise_transition_sec,
    timing_between_pair_transition_sec: request?.timing_between_pair_transition_sec,
    timing_default_rest_sec: request?.timing_default_rest_sec,
    timing_min_segment_seconds: request?.timing_min_segment_seconds,
  });

  return {
    programType,

    // The enriched program (still useful for UI)
    program: step5.program,

    // The emitted rows (what Bubble Emitter produced)
    rows: step6.rows,

    plan: {
      programType,
      program: step5.program,
      rows: step6.rows,
      debug: {
        step1: step1.debug,
        step2: step2.debug,
        step3: step3.debug,
        step4: step4.debug,
        step5: step5.debug,
        step6: step6.debug,
      },
    },

    debug: {
      step1: step1.debug,
      step2: step2.debug,
      step3: step3.debug,
      step4: step4.debug,
      step5: step5.debug,
      step6: step6.debug,
    },
  };
}