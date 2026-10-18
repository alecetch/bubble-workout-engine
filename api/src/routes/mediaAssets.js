import { pool } from "../db.js";
import { resolveMediaUrl, heroRenditionFields } from "../utils/mediaUrl.js";

export function createMediaAssetsHandler(db = pool) {
  return async (req, res) => {
    const usageScope = typeof req.query.usage_scope === "string" ? req.query.usage_scope.trim() : "";
    const dayType = typeof req.query.day_type === "string" ? req.query.day_type.trim() : "";
    const focusType = typeof req.query.focus_type === "string" ? req.query.focus_type.trim() : "";
    const activeRaw = typeof req.query.active === "string" ? req.query.active.trim().toLowerCase() : "";
    const includeInactive = activeRaw === "false";

    const where = [];
    const params = [];

    if (!includeInactive) {
      params.push(true);
      where.push(`is_active = $${params.length}`);
    }

    if (usageScope) {
      params.push(usageScope);
      where.push(`usage_scope = $${params.length}`);
    }

    if (dayType) {
      params.push(dayType);
      where.push(`day_type = $${params.length}`);
    }

    if (focusType) {
      params.push(focusType);
      where.push(`focus_type = $${params.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `
      SELECT
        id,
        usage_scope,
        day_type,
        focus_type,
        label,
        sort_order,
        is_active,
        image_key,
        image_url, renditions_at, thumbhash
      FROM public.media_assets
      ${whereClause}
      ORDER BY sort_order NULLS LAST, label ASC, id ASC
    `;

    try {
      const result = await db.query(sql, params);
      return res.status(200).json({
        items: (result.rows ?? []).map((row) => ({
          id: row.id,
          usageScope: row.usage_scope,
          dayType: row.day_type,
          focusType: row.focus_type,
          label: row.label,
          sortOrder: row.sort_order,
          isActive: row.is_active,
          imageCardUrl: heroRenditionFields(row.image_key, row.renditions_at, row.thumbhash).heroMediaCardUrl,
          thumbhash: heroRenditionFields(row.image_key, row.renditions_at, row.thumbhash).heroMediaThumbhash,
          imageKey: row.image_key,
          imageUrl: typeof row.image_url === "string" && row.image_url.trim()
            ? row.image_url
            : resolveMediaUrl(row),
        })),
      });
    } catch (err) {
      req.log.error({ event: "http.media_assets.error", err: err?.message }, "media-assets error");
      return res.status(500).json({ error: "internal_error" });
    }
  };
}
