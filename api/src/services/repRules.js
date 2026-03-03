export async function fetchActiveRepRules(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("fetchActiveRepRules: db client/pool with query() is required");
  }

  const sql = `
    SELECT
      rule_id,
      schema_version,
      priority,
      program_type,
      day_type,
      segment_type,
      purpose,
      movement_pattern,
      swap_group_id_2,
      equipment_slug,
      reps_unit,
      rep_low,
      rep_high,
      rir_min,
      rir_max,
      rir_target,
      tempo_eccentric,
      tempo_pause_bottom,
      tempo_concentric,
      tempo_pause_top,
      rest_after_set_sec,
      rest_after_round_sec,
      logging_prompt_mode,
      notes_style
    FROM program_rep_rule
    WHERE is_active = TRUE
    ORDER BY priority DESC NULLS LAST, rule_id ASC;
  `;

  const result = await db.query(sql);
  return result.rows ?? [];
}
