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

export async function handleCheckInSubmit(req, res) {
  const userId = req.auth.user_id;
  let s3Key = null;

  if (!req.file) {
    return res.status(400).json({ ok: false, code: "missing_photo", error: "Photo file is required." });
  }

  const consentR = await pool.query(
    `SELECT physique_consent_at FROM app_user WHERE id = $1`,
    [userId],
  );
  if (!consentR.rows[0]?.physique_consent_at) {
    return res.status(403).json({
      ok: false,
      code: "consent_required",
      error: "You must accept the physique tracking terms before uploading a photo.",
    });
  }

  try {
    const timestamp = Date.now();
    s3Key = `physique/${userId}/${timestamp}.jpg`;

    await putObject(s3Key, req.file.buffer, "image/jpeg", PHYSIQUE_BUCKET);

    const priorR = await pool.query(
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
        const signedUrl = await getPresignedUrl(priorRow.photo_s3_key, 120, PHYSIQUE_BUCKET);
        const priorResp = await fetch(signedUrl);
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

    const analysis = await analysePhysiquePhoto(req.file.buffer.toString("base64"), priorPhotoForAnalysis);

    const insertR = await pool.query(
      `INSERT INTO physique_check_in
         (user_id, photo_s3_key, analysis_json, program_emphasis_json)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       RETURNING id, submitted_at`,
      [userId, s3Key, JSON.stringify(analysis), JSON.stringify(analysis.emphasis_suggestions ?? [])],
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
      deleteObject(s3Key, PHYSIQUE_BUCKET).catch(() => {});
    }
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
}

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
