/**
 * Build a public media URL from an S3 key.
 * @param {string | null | undefined} imageKey
 * @returns {string}
 */
export function buildPublicUrl(imageKey) {
  const base = (process.env.S3_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(imageKey ?? "").trim().replace(/^\/+/, "");
  if (!base || !key) return key || "";
  return `${base}/${key}`;
}

/**
 * Build a public exercise media URL from an S3 key.
 * In local dev, the existing S3_PUBLIC_BASE_URL is often scoped to
 * /assets/media-assets for hero images; exercise media is served from the
 * sibling /assets/exercise-media path.
 * @param {string | null | undefined} mediaKey
 * @returns {string}
 */
export function buildExerciseMediaUrl(mediaKey) {
  const key = String(mediaKey ?? "").trim().replace(/^\/+/, "");
  if (!key) return "";

  const configuredBase = (process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configuredBase) {
    return `${configuredBase}/${key.replace(/^exercise-media\/+/, "")}`;
  }

  const base = (process.env.S3_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return key;
  if (/\/assets\/media-assets$/i.test(base)) {
    return `${base.replace(/\/assets\/media-assets$/i, "/assets/exercise-media")}/${key.replace(/^exercise-media\/+/, "")}`;
  }
  return `${base}/${key}`;
}

/**
 * Resolve media URL from a row with image_url/image_key.
 * @param {{ image_url?: string | null, image_key?: string | null } | null | undefined} row
 * @returns {string | null}
 */
export function resolveMediaUrl(row) {
  if (!row) return null;
  const { image_url, image_key } = row;
  if (image_url && /^https?:\/\//i.test(image_url)) return image_url;
  return buildPublicUrl(image_key) || null;
}
