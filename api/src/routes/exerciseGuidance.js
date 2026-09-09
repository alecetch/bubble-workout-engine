import express from "express";
import { pool } from "../db.js";
import { buildExerciseMediaUrl } from "../utils/mediaUrl.js";

export const exerciseGuidanceRouter = express.Router();

exerciseGuidanceRouter.get("/:exerciseId/guidance", async (req, res) => {
  const { request_id } = req;
  try {
    const exerciseId = String(req.params.exerciseId ?? "").trim();
    if (!exerciseId) {
      return res.status(400).json({ ok: false, request_id, error: "exerciseId is required" });
    }

    const result = await pool.query(
      `SELECT
         ec.exercise_id,
         ec.name,
         ec.coaching_cues_json,
         ec.technique_cue,
         ec.technique_setup,
         ec.technique_execution_json,
         ec.technique_mistakes_json,
         ec.technique_video_url,
         ec.load_guidance,
         ec.logging_guidance,
         ec.target_regions_json,
         ec.movement_pattern_primary,
         em.still_image_key,
         em.video_key,
         COALESCE(em.video_status, 'none') AS video_status,
         em.poster_frame_key
       FROM exercise_catalogue ec
       LEFT JOIN exercise_media em ON em.exercise_id = ec.exercise_id
       WHERE ec.exercise_id = $1
         AND ec.is_archived = FALSE`,
      [exerciseId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, request_id, error: "Exercise not found" });
    }

    const row = result.rows[0];
    const videoStatus = row.video_status ?? "none";
    const guidance = {
      exerciseId: row.exercise_id,
      name: row.name,
      coachingCues: Array.isArray(row.coaching_cues_json) ? row.coaching_cues_json : [],
      techniqueCue: row.technique_cue ?? null,
      techniqueSetup: row.technique_setup ?? null,
      techniqueExecution: Array.isArray(row.technique_execution_json)
        ? row.technique_execution_json
        : [],
      techniqueMistakes: Array.isArray(row.technique_mistakes_json)
        ? row.technique_mistakes_json
        : [],
      techniqueVideoUrl: row.technique_video_url ?? null,
      loadGuidance: row.load_guidance ?? null,
      loggingGuidance: row.logging_guidance ?? null,
      targetRegions: Array.isArray(row.target_regions_json) ? row.target_regions_json : [],
      movementPattern: row.movement_pattern_primary ?? null,
      stillImageUrl: buildExerciseMediaUrl(row.still_image_key ?? "exercise-media/_placeholder/still.jpg"),
      videoUrl: videoStatus === "ready" ? buildExerciseMediaUrl(row.video_key) || null : null,
      posterImageUrl: videoStatus === "ready" ? buildExerciseMediaUrl(row.poster_frame_key) || null : null,
      videoStatus,
    };

    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return res.json({ ok: true, guidance });
  } catch (_err) {
    return res.status(500).json({ ok: false, request_id, error: "Internal error" });
  }
});
