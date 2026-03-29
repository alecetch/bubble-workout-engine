import {
  fetchProgramGenerationConfigByKey,
  fetchProgramGenerationConfigs,
} from "../src/services/programGenerationConfig.js";

function safeJsonParse(value, fallback = {}) {
  try {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "object") return value;
    const text = String(value).trim();
    if (!text) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
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

function buildSyntheticRequestConfigRow({ request, programType, schemaVersion, parsedRequestPgc }) {
  const requestProgressionByRank = safeJsonParse(request?.progression_by_rank_json, null);
  const nestedProgressionByRank = safeJsonParse(parsedRequestPgc?.progression_by_rank_json, null);

  let progressionByRankForStep3 = {};
  if (requestProgressionByRank && typeof requestProgressionByRank === "object") {
    progressionByRankForStep3 = requestProgressionByRank;
  } else if (nestedProgressionByRank && typeof nestedProgressionByRank === "object") {
    progressionByRankForStep3 = nestedProgressionByRank;
  }

  return {
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
}

export async function resolveCompiledConfig(dbClient, { programType, schemaVersion, request }) {
  let source = "hardcoded";
  let pgcRow = null;
  let pgcJson = {};

  if (request?.config_key) {
    const byKey = await fetchProgramGenerationConfigByKey(dbClient, request.config_key);
    if (!byKey) {
      throw new Error(`No active ProgramGenerationConfig found for config_key=${request.config_key}`);
    }
    source = "db";
    pgcRow = byKey;
    pgcJson = safeJsonParse(byKey.program_generation_config_json, {});
  } else if (request?.program_generation_config_json) {
    const parsedRequestPgc = safeJsonParse(request.program_generation_config_json, null);
    if (!parsedRequestPgc || typeof parsedRequestPgc !== "object" || Array.isArray(parsedRequestPgc)) {
      throw new Error("Invalid request.program_generation_config_json (must be valid JSON object)");
    }
    source = "request";
    pgcRow = buildSyntheticRequestConfigRow({ request, programType, schemaVersion, parsedRequestPgc });
    pgcJson = parsedRequestPgc;
  } else {
    let rows = [];
    try {
      rows = await fetchProgramGenerationConfigs(dbClient, programType, schemaVersion);
    } catch {
      rows = [];
    }
    const selected = pickPreferredConfigRow(rows, schemaVersion);
    if (selected) {
      source = "db";
      pgcRow = selected;
      pgcJson = safeJsonParse(selected.program_generation_config_json, {});
    }
  }

  return {
    programType,
    schemaVersion,
    configKey: pgcRow?.config_key ?? `hardcoded_${programType}_v${schemaVersion}`,
    source,
    builder: {
      dayTemplates: pgcJson?.builder?.day_templates ?? null,
      setsByDuration: pgcJson?.builder?.sets_by_duration ?? null,
      blockBudget: pgcJson?.builder?.block_budget ?? null,
      slotDefaults: pgcJson?.builder?.slot_defaults ?? {},
      blockVariabilityDefaults: pgcJson?.builder?.block_variability_defaults ?? {},
      excludeMovementClasses:
        pgcJson?.builder?.exclude_movement_classes ?? ["cardio", "conditioning", "locomotion"],
    },
    segmentation: {
      blockSemantics: pgcJson?.segmentation?.block_semantics ?? null,
      blockSemanticsByFocus: pgcJson?.segmentation?.block_semantics_by_focus ?? {},
    },
    progression: {
      progressionByRank: pgcRow?.progression_by_rank_json ?? {},
      weekPhaseConfig: pgcRow?.week_phase_config_json ?? {},
      totalWeeksDefault: pgcRow?.total_weeks_default ?? 4,
      applyToPurposes: pgcJson?.progression?.apply_to_purposes ?? ["main", "secondary", "accessory"],
    },
    raw: {
      programGenerationConfigRow: pgcRow,
      programGenerationConfigJson: pgcJson,
    },
  };
}
