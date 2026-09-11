import express from "express";
import multer from "multer";
import { pool } from "../db.js";
import { requireInternalToken, requireTrustedAdminOrigin } from "../middleware/auth.js";
import { EXERCISE_MEDIA_BUCKET, getObject, putObject } from "../services/s3Service.js";
import { compressExerciseVideo } from "../services/exerciseMediaCompression.js";
import { auditLog } from "../utils/auditLog.js";
import { buildExerciseMediaUrl } from "../utils/mediaUrl.js";
import { publicInternalError } from "../utils/publicError.js";

const PLACEHOLDER_STILL_KEY = "exercise-media/_placeholder/still.jpg";
const MAX_STILL_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);

function uploadSingle(fieldName, { maxBytes, supportedMimeTypes, extensionPattern, label }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter(_req, file, cb) {
      const mime = file.mimetype?.toLowerCase() ?? "";
      if (supportedMimeTypes.has(mime) || extensionPattern.test(file.originalname ?? "")) return cb(null, true);
      return cb(Object.assign(new Error(`Only ${label} files are supported.`), { code: "unsupported_file_type" }));
    },
  });

  return function uploadMiddleware(req, res, next) {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ ok: false, code: "file_too_large", error: `${label} file is too large.` });
      }
      if (err.code === "unsupported_file_type") {
        return res.status(400).json({ ok: false, code: "unsupported_file_type", error: err.message });
      }
      return next(err);
    });
  };
}

const uploadStill = uploadSingle("still", {
  maxBytes: MAX_STILL_BYTES,
  supportedMimeTypes: IMAGE_MIME_TYPES,
  extensionPattern: /\.(jpe?g|png)$/i,
  label: "image",
});

const uploadVideo = uploadSingle("video", {
  maxBytes: MAX_VIDEO_BYTES,
  supportedMimeTypes: VIDEO_MIME_TYPES,
  extensionPattern: /\.(mp4|mov|m4v)$/i,
  label: "video",
});

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

function toSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "warmup-exercise";
}

function mediaObjectKey(key) {
  return String(key ?? "").trim().replace(/^\/+/, "").replace(/^exercise-media\/+/, "");
}

function mapWarmupRow(row) {
  const status = row.video_status ?? "none";
  return {
    warmup_exercise_id: row.warmup_exercise_id,
    warmupExerciseId: row.warmup_exercise_id,
    name: row.name,
    target_regions_json: normalizeArray(row.target_regions_json),
    targetRegions: normalizeArray(row.target_regions_json),
    equipment_items_slugs: normalizeArray(row.equipment_items_slugs),
    equipmentItemsSlugs: normalizeArray(row.equipment_items_slugs),
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
    videoUrl: status === "ready" ? buildExerciseMediaUrl(row.video_key) || null : null,
    posterImageUrl: status === "ready" ? buildExerciseMediaUrl(row.poster_frame_key) || null : null,
    updated_at: row.updated_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function ensureWarmup(db, warmupExerciseId) {
  const result = await db.query(
    `SELECT warmup_exercise_id FROM warmup_exercise WHERE warmup_exercise_id = $1`,
    [warmupExerciseId],
  );
  return result.rowCount > 0;
}

async function allocateSlug(db, name) {
  const base = toSlug(name);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await ensureWarmup(db, candidate))) return candidate;
  }
  throw new Error("Unable to allocate warm-up exercise id");
}

async function writeAudit(auditLogFn, req, id, action, detail) {
  await auditLogFn(req, { action, entity: "warmup_exercise", entityId: id, detail });
}

export function createAdminWarmupExercisesRouter({
  db = pool,
  putObjectFn = putObject,
  getObjectFn = getObject,
  compressExerciseVideoFn = compressExerciseVideo,
  auditLogFn = auditLog,
} = {}) {
  const router = express.Router();
  router.use(requireInternalToken, requireTrustedAdminOrigin);

  router.get("/warmup-exercises/list", async (_req, res) => {
    try {
      const result = await db.query(
        `SELECT
           we.*,
           COALESCE(wm.still_image_key, $1) AS still_image_key,
           COALESCE(wm.still_image_is_placeholder, true) AS still_image_is_placeholder,
           wm.video_key,
           COALESCE(wm.video_status, 'none') AS video_status,
           wm.video_duration_sec,
           wm.video_source_filename,
           wm.poster_frame_key,
           COALESCE(wm.updated_at, we.updated_at) AS updated_at
         FROM warmup_exercise we
         LEFT JOIN warmup_exercise_media wm USING (warmup_exercise_id)
         ORDER BY we.is_archived ASC, we.name ASC`,
        [PLACEHOLDER_STILL_KEY],
      );
      return res.json({ ok: true, warmupExercises: result.rows.map(mapWarmupRow) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/warmup-exercises", async (req, res) => {
    try {
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ ok: false, code: "validation_error", error: "name is required" });
      const id = await allocateSlug(db, name);
      const result = await db.query(
        `INSERT INTO warmup_exercise (
           warmup_exercise_id, name, target_regions_json, equipment_items_slugs,
           cue_text, duration_or_reps_label, rounds, updated_at
         )
         VALUES ($1,$2,$3::jsonb,$4::text[],$5,$6,$7,now())
         RETURNING *`,
        [
          id,
          name,
          JSON.stringify(normalizeArray(req.body?.target_regions_json ?? req.body?.targetRegions)),
          normalizeArray(req.body?.equipment_items_slugs ?? req.body?.equipmentItemsSlugs),
          String(req.body?.cue_text ?? req.body?.cueText ?? "").trim(),
          String(req.body?.duration_or_reps_label ?? req.body?.durationOrRepsLabel ?? "").trim(),
          req.body?.rounds == null || req.body.rounds === "" ? null : Number(req.body.rounds),
        ],
      );
      await db.query(
        `INSERT INTO warmup_exercise_media (warmup_exercise_id, still_image_key, still_image_is_placeholder, uploaded_by, updated_at)
         VALUES ($1, $2, true, $3, now())`,
        [id, PLACEHOLDER_STILL_KEY, actorFromReq(req)],
      );
      await writeAudit(auditLogFn, req, id, "warmup_exercise.create", {});
      return res.json({ ok: true, warmupExercise: mapWarmupRow({ ...result.rows[0], still_image_key: PLACEHOLDER_STILL_KEY }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.patch("/warmup-exercises/:id", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    try {
      const result = await db.query(
        `UPDATE warmup_exercise
         SET name = $2,
             target_regions_json = $3::jsonb,
             equipment_items_slugs = $4::text[],
             cue_text = $5,
             duration_or_reps_label = $6,
             rounds = $7,
             is_archived = COALESCE($8, is_archived),
             updated_at = now()
         WHERE warmup_exercise_id = $1
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
        ],
      );
      if (result.rowCount === 0) return res.status(404).json({ ok: false, code: "not_found", error: "Warm-up exercise not found." });
      await writeAudit(auditLogFn, req, id, "warmup_exercise.update", {});
      return res.json({ ok: true, warmupExercise: mapWarmupRow(result.rows[0]) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.delete("/warmup-exercises/:id", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    try {
      const result = await db.query(
        `UPDATE warmup_exercise SET is_archived = true, updated_at = now() WHERE warmup_exercise_id = $1 RETURNING *`,
        [id],
      );
      if (result.rowCount === 0) return res.status(404).json({ ok: false, code: "not_found", error: "Warm-up exercise not found." });
      await writeAudit(auditLogFn, req, id, "warmup_exercise.archive", {});
      return res.json({ ok: true, warmupExercise: mapWarmupRow(result.rows[0]) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/warmup-exercises/:id/still", uploadStill, async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!req.file) return res.status(400).json({ ok: false, code: "missing_file", error: "Still image file is required." });
    try {
      if (!(await ensureWarmup(db, id))) return res.status(404).json({ ok: false, code: "not_found", error: "Warm-up exercise not found." });
      const key = `warmup-exercise-media/${id}/still.jpg`;
      await putObjectFn(mediaObjectKey(key), req.file.buffer, "image/jpeg", EXERCISE_MEDIA_BUCKET);
      const result = await db.query(
        `INSERT INTO warmup_exercise_media (warmup_exercise_id, still_image_key, still_image_is_placeholder, uploaded_by, updated_at)
         VALUES ($1, $2, false, $3, now())
         ON CONFLICT (warmup_exercise_id) DO UPDATE SET
           still_image_key = EXCLUDED.still_image_key,
           still_image_is_placeholder = false,
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = now()
         RETURNING *`,
        [id, key, actorFromReq(req)],
      );
      await writeAudit(auditLogFn, req, id, "warmup_exercise.still.upload", { still_image_key: key });
      return res.json({ ok: true, media: mapWarmupRow({ ...result.rows[0], warmup_exercise_id: id }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/warmup-exercises/:id/video", uploadVideo, async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!req.file) return res.status(400).json({ ok: false, code: "missing_file", error: "Video file is required." });
    try {
      if (!(await ensureWarmup(db, id))) return res.status(404).json({ ok: false, code: "not_found", error: "Warm-up exercise not found." });
      await db.query(
        `INSERT INTO warmup_exercise_media (warmup_exercise_id, still_image_key, video_status, uploaded_by, updated_at)
         VALUES ($1, $2, 'processing', $3, now())
         ON CONFLICT (warmup_exercise_id) DO UPDATE SET
           video_status = 'processing',
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = now()`,
        [id, PLACEHOLDER_STILL_KEY, actorFromReq(req)],
      );

      let compressed;
      try {
        compressed = await compressExerciseVideoFn(req.file.buffer);
      } catch (err) {
        await db.query(`UPDATE warmup_exercise_media SET video_status = 'failed', updated_at = now() WHERE warmup_exercise_id = $1`, [id]);
        return res.status(422).json({ ok: false, code: "video_processing_failed", error: publicInternalError(err) });
      }

      const videoKey = `warmup-exercise-media/${id}/video.mp4`;
      const posterKey = `warmup-exercise-media/${id}/poster.jpg`;
      await putObjectFn(mediaObjectKey(videoKey), compressed.compressedBuffer, "video/mp4", EXERCISE_MEDIA_BUCKET);
      await putObjectFn(mediaObjectKey(posterKey), compressed.posterBuffer, "image/jpeg", EXERCISE_MEDIA_BUCKET);
      const result = await db.query(
        `UPDATE warmup_exercise_media
         SET video_key = $2,
             poster_frame_key = $3,
             video_duration_sec = $4,
             video_status = 'ready',
             video_source_filename = $5,
             uploaded_by = $6,
             updated_at = now()
         WHERE warmup_exercise_id = $1
         RETURNING *`,
        [id, videoKey, posterKey, compressed.durationSec, req.file.originalname ?? null, actorFromReq(req)],
      );
      await writeAudit(auditLogFn, req, id, "warmup_exercise.video.upload", { video_key: videoKey, poster_frame_key: posterKey });
      return res.json({ ok: true, media: mapWarmupRow({ ...result.rows[0], warmup_exercise_id: id }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/warmup-exercises/:id/use-poster-as-still", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    try {
      if (!(await ensureWarmup(db, id))) return res.status(404).json({ ok: false, code: "not_found", error: "Warm-up exercise not found." });
      const current = await db.query(`SELECT poster_frame_key FROM warmup_exercise_media WHERE warmup_exercise_id = $1`, [id]);
      const posterKey = current.rows[0]?.poster_frame_key ?? null;
      if (!posterKey) return res.status(400).json({ ok: false, code: "missing_poster", error: "No poster frame is available." });
      const stillKey = `warmup-exercise-media/${id}/still.jpg`;
      const posterBuffer = await getObjectFn(mediaObjectKey(posterKey), EXERCISE_MEDIA_BUCKET);
      await putObjectFn(mediaObjectKey(stillKey), posterBuffer, "image/jpeg", EXERCISE_MEDIA_BUCKET);
      const result = await db.query(
        `UPDATE warmup_exercise_media
         SET still_image_key = $2,
             still_image_is_placeholder = false,
             uploaded_by = $3,
             updated_at = now()
         WHERE warmup_exercise_id = $1
         RETURNING *`,
        [id, stillKey, actorFromReq(req)],
      );
      await writeAudit(auditLogFn, req, id, "warmup_exercise.still.use_poster", { poster_frame_key: posterKey });
      return res.json({ ok: true, media: mapWarmupRow({ ...result.rows[0], warmup_exercise_id: id }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  return router;
}

export const adminWarmupExercisesRouter = createAdminWarmupExercisesRouter();
