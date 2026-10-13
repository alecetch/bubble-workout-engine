import { EXERCISE_MEDIA_BUCKET, getObject } from "./s3Service.js";
import { promotionConfig } from "./exerciseMediaPromotion.js";

function responseError(status, body) {
  return body?.error || body?.message || `Production import failed with status ${status}`;
}

export async function promoteHeroMediaRow(row, {
  db,
  getObjectFn = getObject,
  fetchFn = (...args) => fetch(...args),
  config = promotionConfig(),
} = {}) {
  if (!config.enabled) return { ok: false, error: "Production promotion is not configured" };

  try {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      asset_key: row.asset_key,
      usage_scope: row.usage_scope,
      day_type: row.day_type,
      focus_type: row.focus_type,
      label: row.label,
      sort_order: row.sort_order,
      is_active: row.is_active,
      image_key: row.image_key,
      image_url: row.image_url,
    })) {
      if (value !== null && value !== undefined) form.append(key, String(value));
    }
    if (String(row.image_key).startsWith("hero-media/")) {
      const image = await getObjectFn(row.image_key, EXERCISE_MEDIA_BUCKET);
      const ext = row.image_key.split(".").pop()?.toLowerCase() || "jpg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      form.append("image", new Blob([image], { type: mime }), row.image_key.split("/").pop());
    }
    const response = await fetchFn(`${config.baseUrl}/admin/hero-media/import`, {
      method: "POST", headers: { "X-Internal-Token": config.token }, body: form,
    });
    let body = null;
    try { body = await response.json(); } catch { /* empty response */ }
    if (!response.ok || !body?.ok) return { ok: false, error: responseError(response.status, body) };
    await db.query("UPDATE media_assets SET promoted_at = now() WHERE id = $1", [row.id]);
    return { ok: true, id: row.id, assetKey: row.asset_key };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
