import { pool } from "../db.js";
import { buildHyroxRaceCardData } from "./reports/raceCardDataMapper.js";
import { generateRaceCardPng } from "./sharePack/raceCardScreenshotter.js";

const DB_QUERY = `
  SELECT
    a.analysis_json,
    s.display_name,
    s.division,
    s.calculator_mode,
    s.athlete_context_json,
    s.performance_context_json
  FROM hyrox_analyses a
  LEFT JOIN hyrox_submissions s ON s.id = a.submission_id
  WHERE a.submission_id = $1
  LIMIT 1
`;

function buildAthleteContext(row) {
  const ctx = Object.assign(
    {},
    row.athlete_context_json && typeof row.athlete_context_json === "object"
      ? row.athlete_context_json
      : {},
    row.performance_context_json && typeof row.performance_context_json === "object"
      ? row.performance_context_json
      : {},
  );
  if (row.display_name) ctx.displayName = row.display_name;
  if (row.division) ctx.division = row.division;
  return ctx;
}

export function createHyroxRaceCardHandler(db = pool, deps = {}) {
  const { generatePng = generateRaceCardPng } = deps;

  return async function hyroxRaceCardHandler(req, res) {
    const { submissionId } = req.params;
    const { download } = req.query;

    let row;
    try {
      const result = await db.query(DB_QUERY, [submissionId]);
      row = result.rows[0];
    } catch (err) {
      req.log?.error?.({ event: "hyrox.race_card_db_failed", err: err?.message });
      return res.status(500).send("Database error.");
    }

    if (!row || !row.analysis_json) {
      return res.status(404).send("Race card not found.");
    }

    let pngBuffer;
    try {
      const raceCardData = buildHyroxRaceCardData(
        row.analysis_json,
        buildAthleteContext(row),
      );
      pngBuffer = await generatePng(raceCardData);
    } catch (err) {
      req.log?.error?.({ event: "hyrox.race_card_generation_failed", err: err?.message });
      return res.status(500).send("Race card generation failed.");
    }

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store");
    if (download === "1") {
      res.set("Content-Disposition", 'attachment; filename="race-card.png"');
    }
    return res.send(pngBuffer);
  };
}

export const hyroxRaceCardHandler = createHyroxRaceCardHandler();
