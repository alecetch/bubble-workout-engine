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
import { fetchActiveMediaAssets } from "../src/services/mediaAssets.js";
import { fetchActiveNarrationTemplates } from "../src/services/narrationTemplates.js";
import { fetchActiveRepRules } from "../src/services/repRules.js";
import {
  fetchProgramGenerationConfigByKey,
  fetchProgramGenerationConfigs,
} from "../src/services/programGenerationConfig.js";
import { resolveHeroMediaRow, toHeroMediaObject, dayFocusSlug } from "./resolveHeroMedia.js";
import { pool } from "../src/db.js";

function pickCatalogBuildV3(inputs) {
  const catalogBuilds = inputs?.configs?.catalogBuilds?.response?.results ?? [];
  const v3 = catalogBuilds.find((b) => String(b?.version).toLowerCase() === "v3");
  return v3 || catalogBuilds[0] || null;
}

function safeJsonParseMaybe(value, fallback = null) {
  try {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "object") return value;
    const t = String(value).trim();
    if (!t) return fallback;
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

function normalizeNarrationTemplateRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.rows)) return raw.rows;
    if (Array.isArray(raw.data)) return raw.data;
  }
  return [];
}

function pickPreferredConfigRow(rows, schemaVersion) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return null;
  const targetSchema = Number.parseInt(String(schemaVersion), 10);
  const toSchema = (v) =>
    v === null || v === undefined || String(v).trim() === ""
      ? null
      : Number.parseInt(String(v), 10);

  const score = (row) => {
    const sv = toSchema(row?.schema_version);
    if (sv !== null && sv === targetSchema) return 0;
    if (sv === null) return 1;
    return 2;
  };

  return list
    .slice()
    .sort((a, b) => {
      const sA = score(a);
      const sB = score(b);
      if (sA !== sB) return sA - sB;
      return String(a?.config_key ?? "").localeCompare(String(b?.config_key ?? ""));
    })[0];
}

function hardcodedProgramGenerationConfigRow(programType, schemaVersion) {
  return {
    config_key: `hardcoded_${programType}_v${schemaVersion}`,
    is_active: true,
    program_type: programType,
    schema_version: schemaVersion,
    total_weeks_default: 4,
    progression_by_rank_json: {
      beginner: { weekly_set_step: 0, max_extra_sets: 0 },
      intermediate: { weekly_set_step: 1, max_extra_sets: 2 },
      advanced: { weekly_set_step: 1, max_extra_sets: 3 },
      elite: { weekly_set_step: 1, max_extra_sets: 4 },
    },
    week_phase_config_json: {
      default_phase_sequence: ["BASELINE", "BUILD", "BUILD", "CONSOLIDATE"],
      last_week_mode: "consolidate",
    },
    program_generation_config_json: {
      program_type: programType,
      schema_version: schemaVersion,
      total_weeks_default: 4,
      progression_by_rank_json: {
        beginner: { weekly_set_step: 0, max_extra_sets: 0 },
        intermediate: { weekly_set_step: 1, max_extra_sets: 2 },
        advanced: { weekly_set_step: 1, max_extra_sets: 3 },
        elite: { weekly_set_step: 1, max_extra_sets: 4 },
      },
      week_phase_config_json: {
        default_phase_sequence: ["BASELINE", "BUILD", "BUILD", "CONSOLIDATE"],
        last_week_mode: "consolidate",
      },
    },
  };
}

export async function runPipeline({ inputs, programType, request, db }) {
  if (programType !== "hypertrophy") {
    throw new Error(`Unsupported programType: ${programType}`);
  }
  const dbClient = db || pool;

  // ── Media assets (fetched once; no per-day queries) ──────────────────
  let mediaAssets = [];
  let mediaAssetsSource = "none";
  const mediaNotes = [];
  try {
    const rows = await fetchActiveMediaAssets(dbClient);
    if (Array.isArray(rows) && rows.length > 0) {
      mediaAssets = rows;
      mediaAssetsSource = "db";
    } else {
      mediaNotes.push("fetchActiveMediaAssets returned no rows; hero_media_id will be null");
    }
  } catch (err) {
    mediaNotes.push(
      `fetchActiveMediaAssets failed: ${err?.message || String(err)}; hero_media_id will be null`,
    );
  }
  if (!process.env.S3_PUBLIC_BASE_URL) {
    mediaNotes.push("S3_PUBLIC_BASE_URL not set; heroMedia.image_url will be a relative key");
  }

  // Step 1
  const step1 = await buildBasicHypertrophyProgramStep({ inputs, request });
  step1.debug = step1.debug || {};

  // Attach program hero
  const programHeroRow = resolveHeroMediaRow(mediaAssets, "program", programType, null);
  step1.program.hero_media_id = programHeroRow?.id ?? null;
  step1.program.heroMedia = toHeroMediaObject(programHeroRow);
  step1.debug.hero_media_source = programHeroRow ? mediaAssetsSource : "none";
  step1.debug.hero_media_id = step1.program.hero_media_id;
  if (mediaNotes.length) {
    step1.debug.notes = Array.isArray(step1.debug.notes)
      ? step1.debug.notes
      : [];
    step1.debug.notes.push(...mediaNotes);
  }

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
  const schemaVersion = 1;

  let programGenerationConfigs = [];
  let configSource = "hardcoded";
  let pgcSelectedRow = null;
  const step3Notes = [];

  const requestPgcJsonRaw = request?.program_generation_config_json;
  if (requestPgcJsonRaw) {
    const parsedRequestPgc = safeJsonParseMaybe(requestPgcJsonRaw, null);
    if (!parsedRequestPgc || typeof parsedRequestPgc !== "object") {
      throw new Error("Invalid request.program_generation_config_json (must be valid JSON object)");
    }
    const requestProgressionByRank = safeJsonParseMaybe(request?.progression_by_rank_json, null);
    const nestedProgressionByRank = safeJsonParseMaybe(parsedRequestPgc?.progression_by_rank_json, null);
    let progressionByRankForStep3 = {};
    if (requestProgressionByRank && typeof requestProgressionByRank === "object") {
      progressionByRankForStep3 = requestProgressionByRank;
    } else if (nestedProgressionByRank && typeof nestedProgressionByRank === "object") {
      progressionByRankForStep3 = nestedProgressionByRank;
    } else {
      step3Notes.push(
        "Request override missing progression_by_rank_json (request + nested); using empty progression defaults",
      );
    }

    const requestCfgRow = {
      ...parsedRequestPgc,
      config_key: parsedRequestPgc.config_key ?? `request_${programType}_v${schemaVersion}`,
      is_active: true,
      program_type: parsedRequestPgc.program_type ?? programType,
      schema_version:
        parsedRequestPgc.schema_version === null || parsedRequestPgc.schema_version === undefined
          ? schemaVersion
          : parsedRequestPgc.schema_version,
      total_weeks_default: parsedRequestPgc.total_weeks_default,
      progression_by_rank_json: progressionByRankForStep3,
      program_generation_config_json: parsedRequestPgc,
    };

    programGenerationConfigs = [requestCfgRow];
    configSource = "request";
    pgcSelectedRow = requestCfgRow;
  } else if (request?.config_key) {
    const byKey = await fetchProgramGenerationConfigByKey(dbClient, request.config_key);
    if (!byKey) {
      throw new Error(`No active ProgramGenerationConfig found for config_key=${request.config_key}`);
    }
    programGenerationConfigs = [byKey];
    configSource = "db";
    pgcSelectedRow = byKey;
  } else {
    let dbRows = [];
    try {
      dbRows = await fetchProgramGenerationConfigs(dbClient, programType, schemaVersion);
    } catch (err) {
      dbRows = [];
      step3Notes.push(
        `Falling back to Bubble program_generation_config rows (DB fetch failed: ${err?.message || String(err)})`,
      );
    }

    if (Array.isArray(dbRows) && dbRows.length > 0) {
      programGenerationConfigs = dbRows;
      configSource = "db";
      pgcSelectedRow = pickPreferredConfigRow(dbRows, schemaVersion);
    } else if (Array.isArray(cfgRows) && cfgRows.length > 0) {
      programGenerationConfigs = cfgRows;
      configSource = "bubble";
      pgcSelectedRow = pickPreferredConfigRow(cfgRows, schemaVersion) || cfgRows[0];
      step3Notes.push("Falling back to Bubble program_generation_config rows (DB returned no active rows)");
    } else {
      const hardcoded = hardcodedProgramGenerationConfigRow(programType, schemaVersion);
      programGenerationConfigs = [hardcoded];
      configSource = "hardcoded";
      pgcSelectedRow = hardcoded;
      step3Notes.push("Using hardcoded progression defaults (DB and Bubble config rows unavailable)");
    }
  }

  const step3 = await applyProgression({
    program: step2.program,
    programType: "hypertrophy",
    fitnessRank,
    programLength,
    programGenerationConfigs,
    schemaVersion,
    configSource,
  });
  if (step3Notes.length > 0) {
    step3.debug = step3.debug || {};
    step3.debug.notes = Array.isArray(step3.debug.notes) ? step3.debug.notes : [];
    step3.debug.notes.push(...step3Notes);
  }

  // Step 4 (rep rules)
  const build = pickCatalogBuildV3(inputs);
  if (!build) throw new Error("No CatalogBuild found (configs.catalogBuilds).");

  let repRules = null;
  let step4FallbackNote = null;
  try {
    repRules = await fetchActiveRepRules(db || pool);
  } catch (err) {
    repRules = null;
    step4FallbackNote = `Falling back to CatalogBuild rep_rules_json (DB fetch failed: ${err?.message || String(err)})`;
  }
  if (!Array.isArray(repRules) || repRules.length === 0) {
    repRules = null;
    if (!step4FallbackNote) {
      step4FallbackNote = "Falling back to CatalogBuild rep_rules_json (DB returned no active rules)";
    }
  }

  const step4 = await applyRepRules({
    program: step3.program,
    catalogJson: build.catalog_json,
    repRules,
    repRulesJson: build.rep_rules_json,
  });
  if (step4FallbackNote) {
    step4.debug = step4.debug || {};
    step4.debug.notes = Array.isArray(step4.debug.notes) ? step4.debug.notes : [];
    step4.debug.notes.push(step4FallbackNote);
    step4.debug.template = step4.debug.template || {};
    step4.debug.template.notes = Array.isArray(step4.debug.template.notes) ? step4.debug.template.notes : [];
    step4.debug.template.notes.push(step4FallbackNote);
  }

  // Step 5 (narration)
  // narrationTemplatesJson: CatalogBuild.v3 narration_json (you said stored in CatalogBuild)
  // programGenerationConfigJson: ProgramGenerationConfig row (hypertrophy_default_v1; schema_version=1)
  const pgcRow = (inputs?.configs?.genConfigs?.response?.results ?? [])[0] ?? {};
  // If your ProgramGenerationConfig JSON is stored differently, swap this field accordingly:
  const programGenerationConfigJson =
    request?.program_generation_config_json ??
    pgcSelectedRow?.program_generation_config_json ??
    pgcRow?.program_generation_config_json ??
    pgcRow?.config_json ??
    null;

  let narrationTemplates = null;
  let narrationSource = "json";
  const step5Notes = [];

  const requestNarrationTemplatesRaw = request?.narration_templates_json;
  const hasRequestNarrationOverride =
    requestNarrationTemplatesRaw !== null && requestNarrationTemplatesRaw !== undefined;

  if (hasRequestNarrationOverride) {
    const parsedRequestNarration = safeJsonParseMaybe(requestNarrationTemplatesRaw, null);
    const requestNarrationRows = normalizeNarrationTemplateRows(parsedRequestNarration);
    if (requestNarrationRows.length > 0) {
      narrationTemplates = requestNarrationRows;
      narrationSource = "request";
    } else {
      step5Notes.push(
        "Request narration_templates_json override was empty/invalid; falling back to DB narration templates",
      );
    }
  }

  if (!Array.isArray(narrationTemplates) || narrationTemplates.length === 0) {
    try {
      const dbNarrationRows = await fetchActiveNarrationTemplates(dbClient);
      if (Array.isArray(dbNarrationRows) && dbNarrationRows.length > 0) {
        narrationTemplates = dbNarrationRows;
        narrationSource = "db";
      } else {
        narrationTemplates = null;
        step5Notes.push("Falling back to CatalogBuild narration_json (DB returned no active templates)");
      }
    } catch (err) {
      narrationTemplates = null;
      step5Notes.push(
        `Falling back to CatalogBuild narration_json (DB fetch failed: ${err?.message || String(err)})`,
      );
    }
  }

  const narrationTemplatesJson = build?.narration_json ?? JSON.stringify([]);
  if (!Array.isArray(narrationTemplates) || narrationTemplates.length === 0) {
    const hasBuildNarrationJson =
      build?.narration_json !== null &&
      build?.narration_json !== undefined &&
      String(build.narration_json).trim() !== "";
    if (hasBuildNarrationJson) {
      narrationSource = "json";
    } else {
      narrationTemplates = [];
      narrationSource = "hardcoded";
      step5Notes.push("No narration templates available (DB and CatalogBuild narration_json unavailable)");
    }
  }

  const step5 = await applyNarration({
    program: step4.program,
    narrationTemplates,
    narrationTemplatesJson,
    narrationSource,
    programGenerationConfigJson,
    fitnessRank,
    programLength,
    catalogJson: build.catalog_json,
    cooldownSeconds: request?.cooldown_seconds ?? 120,
  });
  step5.debug = step5.debug || {};
  step5.debug.source = narrationSource;
  if (step5Notes.length > 0) {
    step5.debug.notes = Array.isArray(step5.debug.notes) ? step5.debug.notes : [];
    step5.debug.notes.push(...step5Notes);
  }
  step5.program.hero_media_id = programHeroRow?.id ?? null;
  step5.program.heroMedia = toHeroMediaObject(programHeroRow);

  // Attach day hero media to template days and all week days
  function attachDayHeroes(days) {
    for (const day of days || []) {
      const focus = dayFocusSlug(day);
      const row = resolveHeroMediaRow(mediaAssets, "program_day", programType, focus);
      day.hero_media_id = row?.id ?? null;
      day.heroMedia = toHeroMediaObject(row);
      day.day_focus_slug = focus;
    }
  }
  attachDayHeroes(step5.program.days);
  for (const wk of step5.program.weeks ?? []) attachDayHeroes(wk.days);
  step5.debug.day_hero_media_source = mediaAssets.length ? mediaAssetsSource : "none";

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
    // Includes hero_media_id / heroMedia fields for persistence in generateProgramV2.
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
