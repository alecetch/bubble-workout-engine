import { pool } from "../db.js";
import { buildCarouselPage, resolveCarouselData } from "./reports/carouselPageBuilder.js";
import { buildTemplateA } from "./reports/templateSlotMapper.js";
import { rankInsightsForOutput } from "./reports/insightRanker.js";
import { resolveConflicts } from "./reports/conflictResolver.js";

function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function athleteContext(row = {}, storedCarousel = null) {
  const storedAthlete = objectOrNull(storedCarousel?.athlete);
  const slideAthlete = objectOrNull(resolveCarouselData(storedCarousel)?.slides?.[0]);
  return {
    ...objectOrNull(row.athlete_context_json),
    ...objectOrNull(row.performance_context_json),
    calculatorMode: row.calculator_mode ?? objectOrNull(row.athlete_context_json)?.calculatorMode,
    displayName: row.display_name ?? storedAthlete?.displayName ?? slideAthlete?.athlete_name,
    division: row.division ?? storedAthlete?.division,
  };
}

function rebuildCarousel(row = {}) {
  const analysisJson = objectOrNull(row.analysis_json);
  if (!analysisJson || analysisJson.analysisScope === "no_benchmark_data") return null;
  const raw = Array.isArray(row.selected_insights_json) ? row.selected_insights_json : [];
  const insights = resolveConflicts(rankInsightsForOutput(raw, "carousel_a"), "carousel_a");
  return buildTemplateA(analysisJson, insights, athleteContext(row, row.carousel_a_json));
}

export function createHyroxCarouselHandler(db = pool) {
  return async function hyroxCarouselHandler(req, res) {
    try {
      const { submissionId } = req.params;
      const result = await db.query(
        `SELECT
          a.carousel_a_json,
          a.analysis_json,
          a.selected_insights_json,
          s.display_name,
          s.division,
          s.calculator_mode,
          s.athlete_context_json,
          s.performance_context_json
        FROM hyrox_analyses a
        LEFT JOIN hyrox_submissions s ON s.id = a.submission_id
        WHERE a.submission_id = $1
        LIMIT 1`,
        [submissionId],
      );
      const row = result.rows[0];
      if (!row) return res.status(404).send("Carousel not found.");

      const carouselData = rebuildCarousel(row) ?? resolveCarouselData(row.carousel_a_json);
      if (!carouselData) return res.status(404).send("Carousel data not available.");

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.send(buildCarouselPage(carouselData));
    } catch (err) {
      req.log?.error?.({ event: "hyrox.carousel_failed", err: err?.message }, "Carousel render failed");
      return res.status(500).send("Unable to load carousel.");
    }
  };
}

export const hyroxCarouselHandler = createHyroxCarouselHandler();
