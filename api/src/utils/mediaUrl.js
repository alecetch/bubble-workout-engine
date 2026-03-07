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
