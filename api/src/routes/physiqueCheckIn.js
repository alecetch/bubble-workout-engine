import express from "express";
import multer from "multer";
import { pool } from "../db.js";
import { publicInternalError } from "../utils/publicError.js";
import {
  putObject,
  deleteObject,
  getPresignedUrl,
  PHYSIQUE_BUCKET,
} from "../services/s3Service.js";
import { analysePhysiquePhoto } from "../services/physiqueAnalysisService.js";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif",
]);

const _upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
  fileFilter(_req, file, cb) {
    const mime = file.mimetype?.toLowerCase() ?? "";
    if (SUPPORTED_MIME_TYPES.has(mime) || file.originalname?.match(/\.(jpg|jpeg|png|heic|heif)$/i)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Only image files are supported."), { code: "unsupported_file_type" }));
    }
  },
});

export function uploadSingle(req, res, next) {
  _upload.single("photo")(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ ok: false, code: "file_too_large", error: "Photo must be under 10 MB." });
    }
    if (err.code === "unsupported_file_type") {
      return res.status(400).json({ ok: false, code: "unsupported_file_type", error: err.message });
    }
    next(err);
  });
}

export function createCheckInSubmitHandler({
  db = pool,
  putObjectFn = putObject,
  deleteObjectFn = deleteObject,
  getPresignedUrlFn = getPresignedUrl,
  analysePhysiquePhotoFn = analysePhysiquePhoto,
  fetchFn = fetch,
} = {}) {
  return async function handleCheckInSubmit(req, res) {
    const userId = req.auth.user_id;
    let s3Key = null;

    if (!req.file) {
      return res.status(400).json({ ok: false, code: "missing_photo", error: "Photo file is required." });
    }

    const consentR = await db.query(
      `SELECT physique_consent_at FROM app_user WHERE id = $1`,
      [userId],
    );
    const skipAnalysis = String(req.body?.skip_analysis ?? "").toLowerCase() === "true";
    if (skipAnalysis && !consentR.rows[0]?.physique_consent_at) {
      await db.query(
        `UPDATE app_user SET physique_consent_at = now() WHERE id = $1`,
        [userId],
      );
    }
    if (!skipAnalysis && !consentR.rows[0]?.physique_consent_at) {
      return res.status(403).json({
        ok: false,
        code: "consent_required",
        error: "You must accept the physique tracking terms before uploading a photo.",
      });
    }

    try {
      const timestamp = Date.now();
      s3Key = `physique/${userId}/${timestamp}.jpg`;

      await putObjectFn(s3Key, req.file.buffer, "image/jpeg", PHYSIQUE_BUCKET);

      let analysis = null;
      if (!skipAnalysis) {
        const priorR = await db.query(
          `SELECT id, photo_s3_key, submitted_at
           FROM physique_check_in
           WHERE user_id = $1
             AND submitted_at > now() - INTERVAL '30 days'
           ORDER BY submitted_at DESC
           LIMIT 1`,
          [userId],
        );
        const priorRow = priorR.rows[0] ?? null;

        let priorPhotoForAnalysis = null;
        if (priorRow) {
          try {
            const signedUrl = await getPresignedUrlFn(priorRow.photo_s3_key, 120, PHYSIQUE_BUCKET);
            const priorResp = await fetchFn(signedUrl);
            if (priorResp.ok) {
              const buf = Buffer.from(await priorResp.arrayBuffer());
              priorPhotoForAnalysis = {
                base64: buf.toString("base64"),
                submittedAt: new Date(priorRow.submitted_at).toISOString().split("T")[0],
              };
            }
          } catch {
            // Non-fatal - proceed without comparison
          }
        }
        analysis = await analysePhysiquePhotoFn(req.file.buffer.toString("base64"), priorPhotoForAnalysis);
      }

      const insertR = await db.query(
        `INSERT INTO physique_check_in
           (user_id, photo_s3_key, analysis_json, program_emphasis_json)
         VALUES ($1, $2, $3::jsonb, $4::jsonb)
         RETURNING id, submitted_at`,
        [
          userId,
          s3Key,
          analysis ? JSON.stringify(analysis) : null,
          JSON.stringify(analysis?.emphasis_suggestions ?? []),
        ],
      );
      const checkIn = insertR.rows[0];

      return res.status(201).json({
        ok: true,
        check_in_id: checkIn.id,
        submitted_at: checkIn.submitted_at,
        analysis,
      });
    } catch (err) {
      if (s3Key) {
        deleteObjectFn(s3Key, PHYSIQUE_BUCKET).catch(() => {});
      }
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  };
}

export const handleCheckInSubmit = createCheckInSubmitHandler();

export function createTriggerAnalysisHandler({
  db = pool,
  getPresignedUrlFn = getPresignedUrl,
  analysePhysiquePhotoFn = analysePhysiquePhoto,
  fetchFn = fetch,
} = {}) {
  return async function handleTriggerAnalysis(req, res) {
    const userId = req.auth.user_id;
    const { id } = req.params;

    const checkInR = await db.query(
      `SELECT id, photo_s3_key, analysis_json
       FROM physique_check_in
       WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (checkInR.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Check-in not found." });
    }
    const checkIn = checkInR.rows[0];
    if (checkIn.analysis_json !== null) {
      return res.status(409).json({ ok: false, error: "This check-in already has an analysis." });
    }

    try {
      const signedUrl = await getPresignedUrlFn(checkIn.photo_s3_key, 120, PHYSIQUE_BUCKET);
      const photoResp = await fetchFn(signedUrl);
      if (!photoResp.ok) {
        return res.status(502).json({ ok: false, error: "Could not retrieve photo for analysis." });
      }
      const photoBuf = Buffer.from(await photoResp.arrayBuffer());

      const priorR = await db.query(
        `SELECT id, photo_s3_key, submitted_at
         FROM physique_check_in
         WHERE user_id = $1
           AND id != $2
           AND submitted_at < (SELECT submitted_at FROM physique_check_in WHERE id = $2)
         ORDER BY submitted_at DESC
         LIMIT 1`,
        [userId, id],
      );
      let priorPhotoForAnalysis = null;
      if (priorR.rowCount > 0) {
        try {
          const priorUrl = await getPresignedUrlFn(priorR.rows[0].photo_s3_key, 120, PHYSIQUE_BUCKET);
          const priorResp = await fetchFn(priorUrl);
          if (priorResp.ok) {
            const buf = Buffer.from(await priorResp.arrayBuffer());
            priorPhotoForAnalysis = {
              base64: buf.toString("base64"),
              submittedAt: new Date(priorR.rows[0].submitted_at).toISOString().split("T")[0],
            };
          }
        } catch {
          // Non-fatal - proceed without comparison
        }
      }

      const analysis = await analysePhysiquePhotoFn(photoBuf.toString("base64"), priorPhotoForAnalysis);

      await db.query(
        `UPDATE physique_check_in
         SET analysis_json = $1::jsonb,
             program_emphasis_json = $2::jsonb
         WHERE id = $3`,
        [JSON.stringify(analysis), JSON.stringify(analysis.emphasis_suggestions ?? []), id],
      );

      return res.json({ ok: true, analysis });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  };
}

export const handleTriggerAnalysis = createTriggerAnalysisHandler();

export const physiqueReadRouter = express.Router();

physiqueReadRouter.get("/physique/check-ins", async (req, res) => {
  const userId = req.auth.user_id;
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  try {
    const { rows } = await pool.query(
      `SELECT id, submitted_at, photo_s3_key, analysis_json, program_emphasis_json
       FROM physique_check_in
       WHERE user_id = $1
       ORDER BY submitted_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    const checkIns = await Promise.all(
      rows.map(async (row) => {
        let photoUrl = null;
        try {
          photoUrl = await getPresignedUrl(row.photo_s3_key, 3600, PHYSIQUE_BUCKET);
        } catch {
          // Non-fatal
        }
        return {
          id: row.id,
          submitted_at: row.submitted_at,
          photo_url: photoUrl,
          analysis: row.analysis_json,
          program_emphasis: row.program_emphasis_json,
        };
      }),
    );
    return res.json({ ok: true, check_ins: checkIns });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

physiqueReadRouter.delete("/physique/check-ins/:id", async (req, res) => {
  const userId = req.auth.user_id;
  const checkInId = req.params.id;
  try {
    const fetchR = await pool.query(
      `SELECT id, photo_s3_key FROM physique_check_in WHERE id = $1 AND user_id = $2`,
      [checkInId, userId],
    );
    if (fetchR.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Check-in not found." });
    }
    await deleteObject(fetchR.rows[0].photo_s3_key, PHYSIQUE_BUCKET).catch(() => {});
    await pool.query(`DELETE FROM physique_check_in WHERE id = $1`, [checkInId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

physiqueReadRouter.post("/physique/consent", async (req, res) => {
  const userId = req.auth.user_id;
  try {
    await pool.query(`UPDATE app_user SET physique_consent_at = now() WHERE id = $1`, [userId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});
