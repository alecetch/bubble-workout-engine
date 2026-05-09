export async function fetchActiveNarrationTemplates(dbClient) {
  if (!dbClient || typeof dbClient.query !== "function") {
    throw new Error("fetchActiveNarrationTemplates: db client/pool with query() is required");
  }

  const sql = `
    SELECT
      ROW_NUMBER() OVER (ORDER BY priority ASC NULLS LAST, template_id ASC) AS rule_number,
      template_id,
      scope,
      field,
      purpose,
      segment_type,
      priority,
      text_pool_json,
      applies_json
    FROM public.narration_template
    WHERE is_active = TRUE
    ORDER BY priority ASC NULLS LAST, template_id ASC;
  `;

  const result = await dbClient.query(sql);
  return result.rows ?? [];
}
