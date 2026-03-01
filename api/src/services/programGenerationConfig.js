function asRows(result) {
  return result?.rows ?? [];
}

export async function fetchProgramGenerationConfigByKey(db, configKey) {
  if (!db || typeof db.query !== "function") {
    throw new Error("fetchProgramGenerationConfigByKey: db client/pool with query() is required");
  }
  if (!configKey || !String(configKey).trim()) {
    throw new Error("fetchProgramGenerationConfigByKey: configKey is required");
  }

  const sql = `
    SELECT
      config_key,
      is_active,
      notes,
      program_generation_config_json,
      program_type,
      progression_by_rank_json,
      schema_version,
      total_weeks_default,
      week_phase_config_json
    FROM program_generation_config
    WHERE is_active = TRUE
      AND config_key = $1
    ORDER BY schema_version DESC NULLS LAST, config_key ASC
    LIMIT 1;
  `;

  const result = await db.query(sql, [String(configKey).trim()]);
  return asRows(result)[0] ?? null;
}

export async function fetchProgramGenerationConfigs(db, programType, schemaVersion) {
  if (!db || typeof db.query !== "function") {
    throw new Error("fetchProgramGenerationConfigs: db client/pool with query() is required");
  }
  if (!programType || !String(programType).trim()) {
    throw new Error("fetchProgramGenerationConfigs: programType is required");
  }

  const schemaVersionInt = Number.parseInt(String(schemaVersion), 10);
  if (!Number.isFinite(schemaVersionInt)) {
    throw new Error("fetchProgramGenerationConfigs: schemaVersion must be a finite integer");
  }

  const sql = `
    SELECT
      config_key,
      is_active,
      notes,
      program_generation_config_json,
      program_type,
      progression_by_rank_json,
      schema_version,
      total_weeks_default,
      week_phase_config_json
    FROM program_generation_config
    WHERE is_active = TRUE
      AND program_type = $1
      AND (schema_version = $2 OR schema_version IS NULL)
    ORDER BY schema_version DESC NULLS LAST, config_key ASC;
  `;

  const result = await db.query(sql, [String(programType).trim(), schemaVersionInt]);
  return asRows(result);
}
