import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { requirePremium } from "../middleware/requirePremium.js";
import { getPresignedUrl, getInternalPresignedUrl, PHYSIQUE_BUCKET } from "../services/s3Service.js";
import { runPremiumScan } from "../services/physiqueScanService.js";
import { publicInternalError } from "../utils/publicError.js";

const PHOTO_TOKEN_SECRET = process.env.JWT_SECRET || "dev-secret";
const API_BASE = (process.env.API_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

function toScoreDelta(current, prior) {
  const currentScore = Number(current);
  const priorScore = Number(prior);
  if (!Number.isFinite(currentScore) || !Number.isFinite(priorScore)) return null;
  return Math.round((currentScore - priorScore) * 10) / 10;
}

// Returns a proxy URL routed through Express on port 3000, signed with a
// short-lived JWT so the mobile Image component needs no auth header.
function signPhoto(key) {
  if (!key) return null;
  try {
    const token = jwt.sign({ key, bucket: PHYSIQUE_BUCKET }, PHOTO_TOKEN_SECRET, { expiresIn: "1h" });
    return `${API_BASE}/api/physique/photo?t=${token}`;
  } catch {
    return null;
  }
}

function parseRegionTrendRows(rows) {
  const counts = new Map();
  for (const row of rows) {
    const regions = row.region_scores_json && typeof row.region_scores_json === "object"
      ? row.region_scores_json
      : {};
    for (const [slug, entry] of Object.entries(regions)) {
      if (Number.isFinite(Number(entry?.score))) {
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
  }

  const topRegions = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([slug]) => slug);
  const regionTrends = Object.fromEntries(topRegions.map((slug) => [slug, []]));

  for (const row of rows) {
    for (const slug of topRegions) {
      const score = Number(row.region_scores_json?.[slug]?.score);
      if (Number.isFinite(score)) {
        regionTrends[slug].push({
          submitted_at: row.submitted_at,
          score,
        });
      }
    }
  }

  return regionTrends;
}

export async function handleScanSubmit(req, res) {
  const userId = req.auth.user_id;
  if (!req.file) {
    return res.status(400).json({ ok: false, code: "missing_photo", error: "Photo file is required." });
  }

  try {
    const result = await runPremiumScan(userId, req.file.buffer, pool);
    return res.status(201).json(result);
  } catch (err) {
    if (err?.code === "consent_required") {
      return res.status(403).json({ ok: false, code: "consent_required", error: err.message });
    }
    if (err?.code === "low_quality_photo") {
      return res.status(422).json({ ok: false, code: "low_quality_photo", error: err.message });
    }
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
}

// Mounted without userAuth — the signed token in ?t= is self-contained auth.
export const physiquePhotoRouter = express.Router();

// GET /api/physique/photo?t={token}
physiquePhotoRouter.get("/physique/photo", async (req, res) => {
  const token = String(req.query.t ?? "");
  if (!token) return res.status(400).end();

  let payload;
  try {
    payload = jwt.verify(token, PHOTO_TOKEN_SECRET);
  } catch {
    return res.status(401).end();
  }

  const { key, bucket } = payload;
  if (!key || !bucket) return res.status(400).end();

  try {
    // Use internal presigned URL (minio:9000) — this fetch is server-side.
    const presignedUrl = await getInternalPresignedUrl(key, 60, bucket);
    const upstream = await fetch(presignedUrl);
    if (!upstream.ok) return res.status(502).end();

    res.setHeader("Content-Type", upstream.headers.get("Content-Type") || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    // Stream the body through Express
    const reader = upstream.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      await pump();
    };
    await pump();
  } catch (err) {
    res.status(500).end();
  }
});

export const physiqueScanRouter = express.Router();

physiqueScanRouter.get("/physique/scans", requirePremium, async (req, res) => {
  const userId = req.auth.user_id;
  const limit = Math.min(Number(req.query.limit ?? 20), 50);

  try {
    const { rows } = await pool.query(
      `SELECT id, submitted_at, physique_score, photo_s3_key, milestones_json, streak_at_submission
       FROM physique_scan
       WHERE user_id = $1
       ORDER BY submitted_at DESC
       LIMIT $2`,
      [userId, limit],
    );

    const scans = await Promise.all(
      rows.map(async (row, index) => ({
        id: row.id,
        submitted_at: row.submitted_at,
        physique_score: Number(row.physique_score),
        score_delta: toScoreDelta(row.physique_score, rows[index + 1]?.physique_score),
        photo_url: await signPhoto(row.photo_s3_key),
        milestones_achieved: Array.isArray(row.milestones_json) ? row.milestones_json : [],
        streak_at_submission: Number(row.streak_at_submission ?? 0),
      })),
    );

    return res.json({ ok: true, scans });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

physiqueScanRouter.get("/physique/scans/trend", requirePremium, async (req, res) => {
  const userId = req.auth.user_id;
  try {
    const { rows } = await pool.query(
      `SELECT submitted_at, physique_score, region_scores_json
       FROM physique_scan
       WHERE user_id = $1
       ORDER BY submitted_at ASC`,
      [userId],
    );
    const latestRows = rows.slice(-52);

    return res.json({
      ok: true,
      trend: latestRows.map((row) => ({
        submitted_at: row.submitted_at,
        physique_score: Number(row.physique_score),
      })),
      region_trends: parseRegionTrendRows(rows),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

physiqueScanRouter.get("/physique/milestones", requirePremium, async (req, res) => {
  const userId = req.auth.user_id;
  try {
    const { rows } = await pool.query(
      `SELECT milestone_slug, achieved_at, scan_id
       FROM physique_milestone
       WHERE user_id = $1
       ORDER BY achieved_at DESC`,
      [userId],
    );
    return res.json({ ok: true, milestones: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

physiqueScanRouter.get("/physique/scans/comparison", requirePremium, async (req, res) => {
  const userId = req.auth.user_id;
  const scanAId = String(req.query.scan_a_id ?? "").trim();
  const scanBId = String(req.query.scan_b_id ?? "").trim();
  if (!scanAId || !scanBId) {
    return res.status(400).json({ ok: false, error: "scan_a_id and scan_b_id are required." });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, submitted_at, photo_s3_key, physique_score, region_scores_json
       FROM physique_scan
       WHERE user_id = $1
         AND id = ANY($2::uuid[])`,
      [userId, [scanAId, scanBId]],
    );
    const scanA = rows.find((row) => row.id === scanAId);
    const scanB = rows.find((row) => row.id === scanBId);
    if (!scanA || !scanB) {
      return res.status(404).json({ ok: false, error: "Scan not found." });
    }

    const regionDeltas = {};
    const regionA = scanA.region_scores_json ?? {};
    const regionB = scanB.region_scores_json ?? {};
    for (const slug of new Set([...Object.keys(regionA), ...Object.keys(regionB)])) {
      const aScore = Number(regionA?.[slug]?.score);
      const bScore = Number(regionB?.[slug]?.score);
      if (Number.isFinite(aScore) && Number.isFinite(bScore)) {
        regionDeltas[slug] = Math.round((bScore - aScore) * 10) / 10;
      }
    }

    return res.json({
      ok: true,
      scan_a: {
        submitted_at: scanA.submitted_at,
        photo_url: await signPhoto(scanA.photo_s3_key),
        physique_score: Number(scanA.physique_score),
        region_scores: scanA.region_scores_json ?? {},
      },
      scan_b: {
        submitted_at: scanB.submitted_at,
        photo_url: await signPhoto(scanB.photo_s3_key),
        physique_score: Number(scanB.physique_score),
        region_scores: scanB.region_scores_json ?? {},
      },
      region_deltas: regionDeltas,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

physiqueScanRouter.get("/physique/scans/:id", requirePremium, async (req, res) => {
  const userId = req.auth.user_id;
  const scanId = req.params.id;
  try {
    const { rows } = await pool.query(
      `SELECT id, submitted_at, photo_s3_key, physique_score, region_scores_json, body_composition_json,
              observations_json, comparison_json, milestones_json, emphasis_weights_json,
              streak_at_submission, ai_coaching_narrative
       FROM physique_scan
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [scanId, userId],
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ ok: false, error: "Scan not found." });
    }

    return res.json({
      ok: true,
      scan: {
        id: row.id,
        submitted_at: row.submitted_at,
        physique_score: Number(row.physique_score),
        score_delta: row.comparison_json?.score_delta ?? null,
        photo_url: await signPhoto(row.photo_s3_key),
        region_scores: row.region_scores_json ?? {},
        body_composition: row.body_composition_json ?? {},
        observations: Array.isArray(row.observations_json) ? row.observations_json : [],
        comparison: row.comparison_json ?? null,
        milestones_achieved: Array.isArray(row.milestones_json) ? row.milestones_json : [],
        ai_coaching_narrative: row.ai_coaching_narrative ?? null,
        streak: Number(row.streak_at_submission ?? 0),
        emphasis_weights: row.emphasis_weights_json ?? {},
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});
