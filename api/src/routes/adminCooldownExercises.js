import { generateRenditions, storeImageRenditions } from "../services/imageRenditions.js";
import { processVideoUpload, deleteVideoSource } from "../services/exerciseVideoUpload.js";
import express from "express";
import { normalizeStillImage } from "../utils/normalizeStillImage.js";
import { exerciseMediaObjectKey as mediaObjectKey } from "../utils/exerciseMediaObjectKey.js";
import { uploadStillMiddleware as uploadStill, uploadVideoMiddleware as uploadVideo } from "../utils/mediaUploadMiddleware.js";
import { pool } from "../db.js";
import { requireInternalToken, requireTrustedAdminOrigin } from "../middleware/auth.js";
import { EXERCISE_MEDIA_BUCKET, getObject, putObject, deleteObject } from "../services/s3Service.js";
import { compressExerciseVideo, probeVideo, remuxFaststart } from "../services/exerciseMediaCompression.js";
import { auditLog } from "../utils/auditLog.js";
import { buildExerciseMediaUrl, exerciseRenditionFields } from "../utils/mediaUrl.js";
import { publicInternalError } from "../utils/publicError.js";
import { createMediaPromoter, promotionConfig, promotionEligibleSql } from "../services/exerciseMediaPromotion.js";

const PLACEHOLDER_STILL_KEY = "exercise-media/_placeholder/still.jpg";
function actorFromReq(req) {
  return String(req.headers["x-admin-actor"] || req.headers["x-internal-actor"] || "admin").trim() || "admin";
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeArray(parsed);
    } catch {
      // Treat non-JSON strings as comma-separated input.
    }
    return trimmed.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

const INJURY_CODES = new Set([
  "shoulder_issues", "knee_issues", "lower_back_spine", "ankle_foot", "wrist_elbow", "cardiovascular_limitations",
]);

// Returns null when the body omits contraindications (patch leaves the column unchanged).
function contraindicationsFromBody(body) {
  const raw = body?.contraindications_slugs ?? body?.contraindicationsSlugs;
  if (raw == null) return null;
  const values = normalizeArray(raw);
  return { values, invalid: values.filter((value) => !INJURY_CODES.has(value)) };
}

function invalidContraindicationsResponse(res, invalid) {
  return res.status(400).json({
    ok: false,
    code: "validation_error",
    error: `Unknown contraindication code(s): ${invalid.join(", ")}. Use: ${[...INJURY_CODES].join(", ")}.`,
  });
}

function toSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "cooldown-exercise";
}

function isoOrNull(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return String(value);
}

function mapCooldownRow(row) {
  const status = row.video_status ?? "none";
  return {
    cooldown_exercise_id: row.cooldown_exercise_id,
    cooldownExerciseId: row.cooldown_exercise_id,
    name: row.name,
    target_regions_json: normalizeArray(row.target_regions_json),
    targetRegions: normalizeArray(row.target_regions_json),
    equipment_items_slugs: normalizeArray(row.equipment_items_slugs),
    equipmentItemsSlugs: normalizeArray(row.equipment_items_slugs),
    contraindications_slugs: normalizeArray(row.contraindications_slugs),
    contraindicationsSlugs: normalizeArray(row.contraindications_slugs),
    cue_text: row.cue_text ?? "",
    cueText: row.cue_text ?? "",
    duration_or_reps_label: row.duration_or_reps_label ?? "",
    durationOrRepsLabel: row.duration_or_reps_label ?? "",
    rounds: row.rounds == null ? null : Number(row.rounds),
    movement_class: row.movement_class ?? "",
    is_archived: row.is_archived === true,
    isArchived: row.is_archived === true,
    still_image_key: row.still_image_key ?? PLACEHOLDER_STILL_KEY,
    stillImageKey: row.still_image_key ?? PLACEHOLDER_STILL_KEY,
    still_image_is_placeholder: row.still_image_is_placeholder !== false,
    stillImageIsPlaceholder: row.still_image_is_placeholder !== false,
    stillImageUrl: buildExerciseMediaUrl(row.still_image_key ?? PLACEHOLDER_STILL_KEY),
    video_key: row.video_key ?? null,
    videoKey: row.video_key ?? null,
    video_status: status,
    videoStatus: status,
    video_duration_sec: row.video_duration_sec == null ? null : Number(row.video_duration_sec),
    videoDurationSec: row.video_duration_sec == null ? null : Number(row.video_duration_sec),
    video_source_filename: row.video_source_filename ?? null,
    videoSourceFilename: row.video_source_filename ?? null,
    poster_frame_key: row.poster_frame_key ?? null,
    posterFrameKey: row.poster_frame_key ?? null,
    ...exerciseRenditionFields(row),
    videoUrl: status === "ready" ? buildExerciseMediaUrl(row.video_key) || null : null,
    posterImageUrl: status === "ready" ? buildExerciseMediaUrl(row.poster_frame_key) || null : null,
    promoted_still_at: isoOrNull(row.promoted_still_at),
    promotedStillAt: isoOrNull(row.promoted_still_at),
    promoted_video_at: isoOrNull(row.promoted_video_at),
    promotedVideoAt: isoOrNull(row.promoted_video_at),
    updated_at: row.updated_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function ensureCooldown(db, cooldownExerciseId) {
  const result = await db.query(
    `SELECT cooldown_exercise_id FROM cooldown_exercise WHERE cooldown_exercise_id = $1`,
    [cooldownExerciseId],
  );
  return result.rowCount > 0;
}

async function allocateSlug(db, name) {
  const base = toSlug(name);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await ensureCooldown(db, candidate))) return candidate;
  }
  throw new Error("Unable to allocate cool-down exercise id");
}

async function writeAudit(auditLogFn, req, id, action, detail) {
  await auditLogFn(req, { action, entity: "cooldown_exercise", entityId: id, detail });
}

export function createAdminCooldownExercisesRouter({
  db = pool,
  putObjectFn = putObject,
  generateRenditionsFn = generateRenditions,
  getObjectFn = getObject,
  compressExerciseVideoFn = compressExerciseVideo,
  probeVideoFn = probeVideo,
  remuxFaststartFn = remuxFaststart,
  deleteObjectFn = deleteObject,
  auditLogFn = auditLog,
  fetchFn = (...args) => fetch(...args),
} = {}) {
  const router = express.Router();
  router.use(requireInternalToken, requireTrustedAdminOrigin);

  const promoteOne = createMediaPromoter({
    db,
    mediaTable: "cooldown_exercise_media",
    idColumn: "cooldown_exercise_id",
    routePrefix: "cooldown-exercises",
    getObjectFn,
    fetchFn,
  });

  async function fetchPromotionRows({ id = null, eligibleOnly = false } = {}) {
    const conditions = ["e.is_archived = FALSE"];
    const params = [];
    if (id) {
      params.push(id);
      conditions.push(`e.cooldown_exercise_id = $${params.length}`);
    }
    if (eligibleOnly) conditions.push(promotionEligibleSql("m"));
    const result = await db.query(
      `SELECT
         e.cooldown_exercise_id,
         e.name,
         m.still_image_key,
          m.still_image_is_placeholder,
          m.still_renditions_at,
          m.still_thumbhash,
          m.poster_renditions_at,

         m.video_key,
         m.video_source_key,
         COALESCE(m.video_status, 'none') AS video_status,
         m.promoted_still_at,
         m.promoted_video_at
       FROM cooldown_exercise e
       LEFT JOIN cooldown_exercise_media m ON m.cooldown_exercise_id = e.cooldown_exercise_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY e.name ASC`,
      params,
    );
    return result.rows;
  }

  router.get("/cooldown-exercises/list", async (_req, res) => {
    try {
      const result = await db.query(
        `SELECT
           we.*,
           COALESCE(wm.still_image_key, $1) AS still_image_key,
           COALESCE(wm.still_image_is_placeholder, true) AS still_image_is_placeholder,
           wm.still_renditions_at, wm.still_thumbhash, wm.poster_renditions_at,
           wm.video_key,
           wm.video_source_key,
           COALESCE(wm.video_status, 'none') AS video_status,
           wm.video_duration_sec,
           wm.video_source_filename,
           wm.poster_frame_key,
           wm.promoted_still_at,
           wm.promoted_video_at,
           COALESCE(wm.updated_at, we.updated_at) AS updated_at
         FROM cooldown_exercise we
         LEFT JOIN cooldown_exercise_media wm USING (cooldown_exercise_id)
         ORDER BY we.is_archived ASC, we.name ASC`,
        [PLACEHOLDER_STILL_KEY],
      );
      return res.json({ ok: true, promotionEnabled: promotionConfig().enabled, cooldownExercises: result.rows.map(mapCooldownRow) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/cooldown-exercises", async (req, res) => {
    try {
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ ok: false, code: "validation_error", error: "name is required" });
      const contraindications = contraindicationsFromBody(req.body);
      if (contraindications?.invalid.length) return invalidContraindicationsResponse(res, contraindications.invalid);
      const id = await allocateSlug(db, name);
      const result = await db.query(
        `INSERT INTO cooldown_exercise (
           cooldown_exercise_id, name, target_regions_json, equipment_items_slugs,
           cue_text, duration_or_reps_label, rounds, contraindications_slugs, updated_at
         )
         VALUES ($1,$2,$3::jsonb,$4::text[],$5,$6,$7,$8::text[],now())
         RETURNING *`,
        [
          id,
          name,
          JSON.stringify(normalizeArray(req.body?.target_regions_json ?? req.body?.targetRegions)),
          normalizeArray(req.body?.equipment_items_slugs ?? req.body?.equipmentItemsSlugs),
          String(req.body?.cue_text ?? req.body?.cueText ?? "").trim(),
          String(req.body?.duration_or_reps_label ?? req.body?.durationOrRepsLabel ?? "").trim(),
          req.body?.rounds == null || req.body.rounds === "" ? null : Number(req.body.rounds),
          contraindications?.values ?? [],
        ],
      );
      await db.query(
        `INSERT INTO cooldown_exercise_media (cooldown_exercise_id, still_image_key, still_image_is_placeholder, uploaded_by, updated_at)
         VALUES ($1, $2, true, $3, now())`,
        [id, PLACEHOLDER_STILL_KEY, actorFromReq(req)],
      );
      await writeAudit(auditLogFn, req, id, "cooldown_exercise.create", {});
      return res.json({ ok: true, cooldownExercise: mapCooldownRow({ ...result.rows[0], still_image_key: PLACEHOLDER_STILL_KEY }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.patch("/cooldown-exercises/:id", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    const contraindications = contraindicationsFromBody(req.body);
    if (contraindications?.invalid.length) return invalidContraindicationsResponse(res, contraindications.invalid);
    try {
      const result = await db.query(
        `UPDATE cooldown_exercise
         SET name = $2,
             target_regions_json = $3::jsonb,
             equipment_items_slugs = $4::text[],
             cue_text = $5,
             duration_or_reps_label = $6,
             rounds = $7,
             is_archived = COALESCE($8, is_archived),
             contraindications_slugs = COALESCE($9::text[], contraindications_slugs),
             updated_at = now()
         WHERE cooldown_exercise_id = $1
         RETURNING *`,
        [
          id,
          String(req.body?.name ?? "").trim(),
          JSON.stringify(normalizeArray(req.body?.target_regions_json ?? req.body?.targetRegions)),
          normalizeArray(req.body?.equipment_items_slugs ?? req.body?.equipmentItemsSlugs),
          String(req.body?.cue_text ?? req.body?.cueText ?? "").trim(),
          String(req.body?.duration_or_reps_label ?? req.body?.durationOrRepsLabel ?? "").trim(),
          req.body?.rounds == null || req.body.rounds === "" ? null : Number(req.body.rounds),
          req.body?.is_archived ?? req.body?.isArchived ?? null,
          contraindications?.values ?? null,
        ],
      );
      if (result.rowCount === 0) return res.status(404).json({ ok: false, code: "not_found", error: "Cool-down exercise not found." });
      await writeAudit(auditLogFn, req, id, "cooldown_exercise.update", {});
      return res.json({ ok: true, cooldownExercise: mapCooldownRow(result.rows[0]) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.delete("/cooldown-exercises/:id", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    try {
      const result = await db.query(
        `UPDATE cooldown_exercise SET is_archived = true, updated_at = now() WHERE cooldown_exercise_id = $1 RETURNING *`,
        [id],
      );
      if (result.rowCount === 0) return res.status(404).json({ ok: false, code: "not_found", error: "Cool-down exercise not found." });
      await writeAudit(auditLogFn, req, id, "cooldown_exercise.archive", {});
      return res.json({ ok: true, cooldownExercise: mapCooldownRow(result.rows[0]) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/cooldown-exercises/:id/still", uploadStill, async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!req.file) return res.status(400).json({ ok: false, code: "missing_file", error: "Still image file is required." });
    try {
      const normalized = await normalizeStillImage(req.file.buffer);
      if (!(await ensureCooldown(db, id))) return res.status(404).json({ ok: false, code: "not_found", error: "Cool-down exercise not found." });
      const key = `cooldown-exercise-media/${id}/still.jpg`;
      await putObjectFn(mediaObjectKey(key), normalized.buffer, "image/jpeg", EXERCISE_MEDIA_BUCKET);
      const result = await db.query(
        `INSERT INTO cooldown_exercise_media (cooldown_exercise_id, still_image_key, still_image_is_placeholder, uploaded_by, updated_at)
         VALUES ($1, $2, false, $3, now())
         ON CONFLICT (cooldown_exercise_id) DO UPDATE SET
           still_image_key = EXCLUDED.still_image_key,
           still_image_is_placeholder = false,
           still_renditions_at = null, still_thumbhash = null,
           promoted_still_at = null,
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = now()
         RETURNING *`,
        [id, key, actorFromReq(req)],
      );
      const derived = await storeImageRenditions({ db, table: "cooldown_exercise_media", idColumn: "cooldown_exercise_id", id: id, kind: "still", key: key, buffer: normalized.buffer, putObjectFn, generateRenditionsFn, log: req.log });
      if (derived?.fields) Object.assign(result.rows[0], derived.fields);
      await writeAudit(auditLogFn, req, id, "cooldown_exercise.still.upload", { still_image_key: key });
      return res.json({ ok: true, media: mapCooldownRow({ ...result.rows[0], cooldown_exercise_id: id }) });
    } catch (err) {
      if (err.code === "invalid_image") {
        return res.status(400).json({ ok: false, code: "invalid_image", error: "Could not read the image file." });
      }
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/cooldown-exercises/:id/video", uploadVideo, async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!req.file) return res.status(400).json({ ok: false, code: "missing_file", error: "Video file is required." });
    try {
      if (!(await ensureCooldown(db, id))) return res.status(404).json({ ok: false, code: "not_found", error: "Cool-down exercise not found." });
      await db.query(
        `INSERT INTO cooldown_exercise_media (cooldown_exercise_id, still_image_key, video_status, uploaded_by, updated_at)
         VALUES ($1, $2, 'processing', $3, now())
         ON CONFLICT (cooldown_exercise_id) DO UPDATE SET
           video_status = 'processing',
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = now()`,
        [id, PLACEHOLDER_STILL_KEY, actorFromReq(req)],
      );

      let compressed;
      try {
        compressed = await processVideoUpload({
          file: req.file, prefix: `cooldown-exercise-media/${id}`, precompressed: req.query.precompressed === "1",
          putObjectFn, compressExerciseVideoFn, probeVideoFn, remuxFaststartFn,
        });
      } catch (err) {
        await db.query(`UPDATE cooldown_exercise_media SET video_status = 'failed', updated_at = now() WHERE cooldown_exercise_id = $1`, [id]);
        if (err.code === "video_source_storage_failed") return res.status(500).json({ ok: false, error: publicInternalError(err) });
        return res.status(422).json({ ok: false, code: "video_processing_failed", error: publicInternalError(err) });
      }

      const videoKey = `cooldown-exercise-media/${id}/video.mp4`;
      const posterKey = `cooldown-exercise-media/${id}/poster.jpg`;
      await putObjectFn(mediaObjectKey(videoKey), compressed.compressedBuffer, "video/mp4", EXERCISE_MEDIA_BUCKET);
      await putObjectFn(mediaObjectKey(posterKey), compressed.posterBuffer, "image/jpeg", EXERCISE_MEDIA_BUCKET);
      const result = await db.query(
        `UPDATE cooldown_exercise_media
         SET video_key = $2,
             video_source_key = $7,
             poster_frame_key = $3,
             video_duration_sec = $4,
             video_status = 'ready',
             poster_renditions_at = null,
             promoted_video_at = null,
             video_source_filename = $5,
             uploaded_by = $6,
             updated_at = now()
         WHERE cooldown_exercise_id = $1
         RETURNING *`,
        [id, videoKey, posterKey, compressed.durationSec, req.file.originalname ?? null, actorFromReq(req), compressed.sourceKey],
      );
      const derived = await storeImageRenditions({ db, table: "cooldown_exercise_media", idColumn: "cooldown_exercise_id", id: id, kind: "poster", key: posterKey, buffer: compressed.posterBuffer, putObjectFn, generateRenditionsFn, log: req.log });
      if (derived?.fields) Object.assign(result.rows[0], derived.fields);
      await writeAudit(auditLogFn, req, id, "cooldown_exercise.video.upload", { video_key: videoKey, poster_frame_key: posterKey });
      return res.json({ ok: true, media: mapCooldownRow({ ...result.rows[0], cooldown_exercise_id: id }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/cooldown-exercises/:id/use-poster-as-still", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    try {
      if (!(await ensureCooldown(db, id))) return res.status(404).json({ ok: false, code: "not_found", error: "Cool-down exercise not found." });
      const current = await db.query(`SELECT poster_frame_key FROM cooldown_exercise_media WHERE cooldown_exercise_id = $1`, [id]);
      const posterKey = current.rows[0]?.poster_frame_key ?? null;
      if (!posterKey) return res.status(400).json({ ok: false, code: "missing_poster", error: "No poster frame is available." });
      const stillKey = `cooldown-exercise-media/${id}/still.jpg`;
      const posterBuffer = await getObjectFn(mediaObjectKey(posterKey), EXERCISE_MEDIA_BUCKET);
      await putObjectFn(mediaObjectKey(stillKey), posterBuffer, "image/jpeg", EXERCISE_MEDIA_BUCKET);
      const result = await db.query(
        `UPDATE cooldown_exercise_media
         SET still_image_key = $2,
             still_image_is_placeholder = false,
           still_renditions_at = null, still_thumbhash = null,
             promoted_still_at = null,
             uploaded_by = $3,
             updated_at = now()
         WHERE cooldown_exercise_id = $1
         RETURNING *`,
        [id, stillKey, actorFromReq(req)],
      );
      const derived = await storeImageRenditions({ db, table: "cooldown_exercise_media", idColumn: "cooldown_exercise_id", id: id, kind: "still", key: stillKey, buffer: posterBuffer, putObjectFn, generateRenditionsFn, log: req.log });
      if (derived?.fields) Object.assign(result.rows[0], derived.fields);
      await writeAudit(auditLogFn, req, id, "cooldown_exercise.still.use_poster", { poster_frame_key: posterKey });
      return res.json({ ok: true, media: mapCooldownRow({ ...result.rows[0], cooldown_exercise_id: id }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.delete("/cooldown-exercises/:id/video", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    try {
      if (!(await ensureCooldown(db, id))) return res.status(404).json({ ok: false, code: "not_found", error: "Cool-down exercise not found." });
      await deleteVideoSource({ db, table: "cooldown_exercise_media", idColumn: "cooldown_exercise_id", id: id, deleteObjectFn });
      const result = await db.query(
        `UPDATE cooldown_exercise_media
         SET video_key = null,
             video_source_key = null,
             poster_frame_key = null,
             video_duration_sec = null,
             video_source_filename = null,
             video_status = 'none',
             promoted_video_at = null,
             uploaded_by = $2,
             updated_at = now()
         WHERE cooldown_exercise_id = $1
         RETURNING *`,
        [id, actorFromReq(req)],
      );
      await writeAudit(auditLogFn, req, id, "cooldown_exercise.video.delete", {});
      return res.json({ ok: true, media: result.rows[0] ? mapCooldownRow({ ...result.rows[0], cooldown_exercise_id: id }) : null });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/cooldown-exercises/promote-all", async (_req, res) => {
    if (!promotionConfig().enabled) {
      return res.status(400).json({ ok: false, error: "Production promotion is not configured" });
    }
    try {
      const rows = await fetchPromotionRows({ eligibleOnly: true });
      const results = [];
      for (const row of rows) {
        const result = await promoteOne(row);
        results.push({
          exerciseId: row.cooldown_exercise_id,
          name: row.name,
          promoted: result.promoted ?? { still: false, video: false },
          ...(result.errors ? { errors: result.errors } : {}),
        });
      }
      return res.json({ ok: true, results });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/cooldown-exercises/:id/promote", async (req, res) => {
    if (!promotionConfig().enabled) {
      return res.status(400).json({ ok: false, error: "Production promotion is not configured" });
    }
    const id = String(req.params.id ?? "").trim();
    try {
      const rows = await fetchPromotionRows({ id });
      if (!rows.length) return res.status(404).json({ ok: false, code: "not_found", error: "Cool-down exercise not found." });
      const result = await promoteOne(rows[0]);
      return res.json({
        ok: true,
        promoted: result.promoted,
        ...(result.errors ? { errors: result.errors } : {}),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  return router;
}

export const adminCooldownExercisesRouter = createAdminCooldownExercisesRouter();
