import express from "express";
import { pool } from "../db.js";

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
         exercise_id,
         name,
         coaching_cues_json,
         technique_cue,
         technique_setup,
         technique_execution_json,
         technique_mistakes_json,
         technique_video_url,
         load_guidance,
         logging_guidance,
         target_regions_json,
         movement_pattern_primary
       FROM exercise_catalogue
       WHERE exercise_id = $1
         AND is_archived = FALSE`,
      [exerciseId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, request_id, error: "Exercise not found" });
    }

    const row = result.rows[0];
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
    };

    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return res.json({ ok: true, guidance });
  } catch (_err) {
    return res.status(500).json({ ok: false, request_id, error: "Internal error" });
  }
});
