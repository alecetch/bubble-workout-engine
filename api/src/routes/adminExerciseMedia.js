import express from "express";
import multer from "multer";
import { pool } from "../db.js";
import { requireInternalToken, requireTrustedAdminOrigin } from "../middleware/auth.js";
import {
  EXERCISE_MEDIA_BUCKET,
  getObject,
  putObject,
} from "../services/s3Service.js";
import { compressExerciseVideo } from "../services/exerciseMediaCompression.js";
import { auditLog } from "../utils/auditLog.js";
import { buildExerciseMediaUrl } from "../utils/mediaUrl.js";
import { publicInternalError } from "../utils/publicError.js";

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
      if (supportedMimeTypes.has(mime) || extensionPattern.test(file.originalname ?? "")) {
        cb(null, true);
        return;
      }
      cb(Object.assign(new Error(`Only ${label} files are supported.`), { code: "unsupported_file_type" }));
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

function mediaUrl(key) {
  return buildExerciseMediaUrl(key) || "";
}

function exerciseMediaObjectKey(key) {
  return String(key ?? "").trim().replace(/^\/+/, "").replace(/^exercise-media\/+/, "");
}

function mapMediaRow(row) {
  const status = row.video_status ?? "none";
  return {
    exercise_id: row.exercise_id,
    exerciseId: row.exercise_id,
    name: row.name,
    is_archived: row.is_archived,
    isArchived: row.is_archived,
    still_image_key: row.still_image_key,
    stillImageKey: row.still_image_key,
    still_image_is_placeholder: row.still_image_is_placeholder !== false,
    stillImageIsPlaceholder: row.still_image_is_placeholder !== false,
    stillImageUrl: mediaUrl(row.still_image_key),
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
    videoUrl: status === "ready" ? mediaUrl(row.video_key) || null : null,
    posterImageUrl: status === "ready" ? mediaUrl(row.poster_frame_key) || null : null,
    updated_at: row.updated_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function ensureExercise(db, exerciseId) {
  const result = await db.query(
    `SELECT exercise_id FROM exercise_catalogue WHERE exercise_id = $1`,
    [exerciseId],
  );
  return result.rowCount > 0;
}

async function writeAudit(auditLogFn, req, exerciseId, action, detail) {
  await auditLogFn(req, {
    action,
    entity: "exercise_media",
    entityId: exerciseId,
    detail,
  });
}

export function createAdminExerciseMediaRouter({
  db = pool,
  putObjectFn = putObject,
  getObjectFn = getObject,
  compressExerciseVideoFn = compressExerciseVideo,
  auditLogFn = auditLog,
} = {}) {
  const router = express.Router();
  router.use(requireInternalToken, requireTrustedAdminOrigin);

  router.get("/exercise-media/list", async (_req, res) => {
    try {
      const result = await db.query(
        `SELECT
           ec.exercise_id,
           ec.name,
           ec.is_archived,
           COALESCE(em.still_image_key, 'exercise-media/_placeholder/still.jpg') AS still_image_key,
           COALESCE(em.still_image_is_placeholder, true) AS still_image_is_placeholder,
           em.video_key,
           COALESCE(em.video_status, 'none') AS video_status,
           em.video_duration_sec,
           em.video_source_filename,
           em.poster_frame_key,
           em.updated_at
         FROM exercise_catalogue ec
         LEFT JOIN exercise_media em ON em.exercise_id = ec.exercise_id
         WHERE ec.is_archived = FALSE
         ORDER BY ec.name ASC`,
      );
      return res.json({ ok: true, exercises: result.rows.map(mapMediaRow) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/exercise-media/:exerciseId/still", uploadStill, async (req, res) => {
    const exerciseId = String(req.params.exerciseId ?? "").trim();
    if (!req.file) {
      return res.status(400).json({ ok: false, code: "missing_file", error: "Still image file is required." });
    }
    try {
      if (!(await ensureExercise(db, exerciseId))) {
        return res.status(404).json({ ok: false, code: "not_found", error: "Exercise not found." });
      }
      const key = `exercise-media/${exerciseId}/still.jpg`;
      await putObjectFn(exerciseMediaObjectKey(key), req.file.buffer, "image/jpeg", EXERCISE_MEDIA_BUCKET);
      const result = await db.query(
        `INSERT INTO exercise_media (exercise_id, still_image_key, still_image_is_placeholder, uploaded_by, updated_at)
         VALUES ($1, $2, false, $3, now())
         ON CONFLICT (exercise_id) DO UPDATE SET
           still_image_key = EXCLUDED.still_image_key,
           still_image_is_placeholder = false,
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = now()
         RETURNING *`,
        [exerciseId, key, actorFromReq(req)],
      );
      await writeAudit(auditLogFn, req, exerciseId, "exercise_media.still.upload", { still_image_key: key });
      return res.json({ ok: true, media: mapMediaRow({ ...result.rows[0], name: null, is_archived: false }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/exercise-media/:exerciseId/video", uploadVideo, async (req, res) => {
    const exerciseId = String(req.params.exerciseId ?? "").trim();
    if (!req.file) {
      return res.status(400).json({ ok: false, code: "missing_file", error: "Video file is required." });
    }
    try {
      if (!(await ensureExercise(db, exerciseId))) {
        return res.status(404).json({ ok: false, code: "not_found", error: "Exercise not found." });
      }
      await db.query(
        `INSERT INTO exercise_media (exercise_id, still_image_key, video_status, uploaded_by, updated_at)
         VALUES ($1, 'exercise-media/_placeholder/still.jpg', 'processing', $2, now())
         ON CONFLICT (exercise_id) DO UPDATE SET
           video_status = 'processing',
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = now()`,
        [exerciseId, actorFromReq(req)],
      );

      let compressed;
      try {
        compressed = await compressExerciseVideoFn(req.file.buffer);
      } catch (err) {
        await db.query(
          `UPDATE exercise_media
           SET video_status = 'failed', updated_at = now()
           WHERE exercise_id = $1`,
          [exerciseId],
        );
        return res.status(422).json({ ok: false, code: "video_processing_failed", error: publicInternalError(err) });
      }

      const videoKey = `exercise-media/${exerciseId}/video.mp4`;
      const posterKey = `exercise-media/${exerciseId}/poster.jpg`;
      let result;
      try {
        await putObjectFn(exerciseMediaObjectKey(videoKey), compressed.compressedBuffer, "video/mp4", EXERCISE_MEDIA_BUCKET);
        await putObjectFn(exerciseMediaObjectKey(posterKey), compressed.posterBuffer, "image/jpeg", EXERCISE_MEDIA_BUCKET);
        result = await db.query(
          `UPDATE exercise_media
           SET video_key = $2,
               poster_frame_key = $3,
               video_duration_sec = $4,
               video_status = 'ready',
               video_source_filename = $5,
               uploaded_by = $6,
               updated_at = now()
           WHERE exercise_id = $1
           RETURNING *`,
          [exerciseId, videoKey, posterKey, compressed.durationSec, req.file.originalname ?? null, actorFromReq(req)],
        );
      } catch (err) {
        // Compression succeeded but storage/DB write after it failed - without this,
        // the row is left stuck at 'processing' forever (video_key never gets set,
        // and nothing else ever revisits this row to resolve it).
        await db.query(
          `UPDATE exercise_media
           SET video_status = 'failed', updated_at = now()
           WHERE exercise_id = $1`,
          [exerciseId],
        );
        return res.status(500).json({ ok: false, error: publicInternalError(err) });
      }
      await writeAudit(auditLogFn, req, exerciseId, "exercise_media.video.upload", {
        video_key: videoKey,
        poster_frame_key: posterKey,
      });
      return res.json({ ok: true, media: mapMediaRow({ ...result.rows[0], name: null, is_archived: false }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.delete("/exercise-media/:exerciseId/video", async (req, res) => {
    const exerciseId = String(req.params.exerciseId ?? "").trim();
    try {
      if (!(await ensureExercise(db, exerciseId))) {
        return res.status(404).json({ ok: false, code: "not_found", error: "Exercise not found." });
      }
      const result = await db.query(
        `UPDATE exercise_media
         SET video_key = null,
             poster_frame_key = null,
             video_duration_sec = null,
             video_source_filename = null,
             video_status = 'none',
             uploaded_by = $2,
             updated_at = now()
         WHERE exercise_id = $1
         RETURNING *`,
        [exerciseId, actorFromReq(req)],
      );
      await writeAudit(auditLogFn, req, exerciseId, "exercise_media.video.delete", {});
      return res.json({ ok: true, media: mapMediaRow({ ...result.rows[0], name: null, is_archived: false }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.post("/exercise-media/:exerciseId/use-poster-as-still", async (req, res) => {
    const exerciseId = String(req.params.exerciseId ?? "").trim();
    try {
      if (!(await ensureExercise(db, exerciseId))) {
        return res.status(404).json({ ok: false, code: "not_found", error: "Exercise not found." });
      }
      const current = await db.query(
        `SELECT poster_frame_key FROM exercise_media WHERE exercise_id = $1`,
        [exerciseId],
      );
      const posterKey = current.rows[0]?.poster_frame_key ?? null;
      if (!posterKey) {
        return res.status(400).json({ ok: false, code: "missing_poster", error: "No poster frame is available." });
      }
      const stillKey = `exercise-media/${exerciseId}/still.jpg`;
      const posterBuffer = await getObjectFn(exerciseMediaObjectKey(posterKey), EXERCISE_MEDIA_BUCKET);
      await putObjectFn(exerciseMediaObjectKey(stillKey), posterBuffer, "image/jpeg", EXERCISE_MEDIA_BUCKET);
      const result = await db.query(
        `UPDATE exercise_media
         SET still_image_key = $2,
             still_image_is_placeholder = false,
             uploaded_by = $3,
             updated_at = now()
         WHERE exercise_id = $1
         RETURNING *`,
        [exerciseId, stillKey, actorFromReq(req)],
      );
      await writeAudit(auditLogFn, req, exerciseId, "exercise_media.still.use_poster", { poster_frame_key: posterKey });
      return res.json({ ok: true, media: mapMediaRow({ ...result.rows[0], name: null, is_archived: false }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  return router;
}

export const adminExerciseMediaRouter = createAdminExerciseMediaRouter();
