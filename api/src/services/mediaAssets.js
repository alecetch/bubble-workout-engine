export async function fetchActiveMediaAssets(dbClient) {
  if (!dbClient || typeof dbClient.query !== "function") {
    throw new Error("fetchActiveMediaAssets: db client with query() required");
  }
  const sql = `
      SELECT id, usage_scope, day_type, focus_type, label,
             image_key, image_url, sort_order
      FROM public.media_assets
      WHERE is_active = TRUE
      ORDER BY usage_scope ASC, sort_order ASC NULLS LAST, id ASC
    `;
  const result = await dbClient.query(sql);
  return result.rows ?? [];
}
