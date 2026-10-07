import { EXERCISE_MEDIA_BUCKET, getObject } from "./s3Service.js";
import logger from "../utils/logger.js";

// Dev-to-production promotion for exercise media, shared by the main-workout,
// warm-up and cool-down admin routers. Promotion re-uploads the dev still/video
// to the matching production admin upload route, which re-runs compression and
// overwrites the same object keys there, then stamps promoted_*_at locally.

export function promotionConfig() {
  const baseUrl = String(process.env.PROD_ADMIN_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const token = String(process.env.PROD_INTERNAL_API_TOKEN || "").trim();
  return { baseUrl, token, enabled: Boolean(baseUrl && token) };
}

export function needsStillPromotion(row) {
  return row?.still_image_is_placeholder === false && !row?.promoted_still_at;
}

export function needsVideoPromotion(row) {
  return row?.video_status === "ready" && !row?.promoted_video_at;
}

// SQL fragment matching rows with anything left to promote; `alias` is the media table alias.
export function promotionEligibleSql(alias) {
  return `(
        (${alias}.still_image_is_placeholder = false AND ${alias}.promoted_still_at IS NULL)
        OR (${alias}.video_status = 'ready' AND ${alias}.promoted_video_at IS NULL)
      )`;
}

function mediaObjectKey(key) {
  return String(key ?? "").trim().replace(/^\/+/, "").replace(/^exercise-media\/+/, "");
}

function errorMessageFromResponse(status, body) {
  const bodyError = body && typeof body === "object" ? body.error || body.message : "";
  return bodyError ? String(bodyError) : `Production upload failed with status ${status}`;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.mediaTable   local media table, e.g. "exercise_media"
 * @param {string} opts.idColumn     its key column, e.g. "exercise_id"
 * @param {string} opts.routePrefix  production admin route prefix, e.g. "exercise-media"
 */
export function createMediaPromoter({
  db,
  mediaTable,
  idColumn,
  routePrefix,
  getObjectFn = getObject,
  fetchFn = (...args) => fetch(...args),
}) {
  return async function promoteOne(row) {
    const { baseUrl, token, enabled } = promotionConfig();
    if (!enabled) {
      return { ok: false, error: "Production promotion is not configured" };
    }

    const promoted = { still: false, video: false };
    const errors = {};
    const id = row[idColumn];

    async function promotePart(kind, key, contentType, fileName, timestampColumn) {
      try {
        const buffer = await getObjectFn(mediaObjectKey(key), EXERCISE_MEDIA_BUCKET);
        const form = new FormData();
        form.append(kind, new Blob([buffer], { type: contentType }), fileName);
        const response = await fetchFn(`${baseUrl}/admin/${routePrefix}/${encodeURIComponent(id)}/${kind}`, {
          method: "POST",
          headers: { "X-Internal-Token": token },
          body: form,
        });
        const body = await readJsonResponse(response);
        if (!response.ok || !body?.ok) {
          errors[kind] = errorMessageFromResponse(response.status, body);
          return;
        }
        await db.query(
          `UPDATE ${mediaTable} SET ${timestampColumn} = now(), updated_at = now() WHERE ${idColumn} = $1`,
          [id],
        );
        promoted[kind] = true;
      } catch (err) {
        logger.error({ err, id, mediaTable, kind }, "exercise-media promotion request failed locally");
        errors[kind] = err?.message || String(err);
      }
    }

    if (needsStillPromotion(row)) {
      await promotePart("still", row.still_image_key, "image/jpeg", "still.jpg", "promoted_still_at");
    }
    if (needsVideoPromotion(row)) {
      await promotePart("video", row.video_key, "video/mp4", "video.mp4", "promoted_video_at");
    }

    return {
      ok: true,
      id,
      name: row.name,
      promoted,
      ...(Object.keys(errors).length ? { errors } : {}),
    };
  };
}
