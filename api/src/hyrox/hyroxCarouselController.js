import { pool } from "../db.js";
import { buildCarouselPage, resolveCarouselData } from "./reports/carouselPageBuilder.js";

export function createHyroxCarouselHandler(db = pool) {
  return async function hyroxCarouselHandler(req, res) {
    try {
      const { submissionId } = req.params;
      const result = await db.query(
        "SELECT carousel_a_json FROM hyrox_analyses WHERE submission_id = $1 LIMIT 1",
        [submissionId],
      );
      const row = result.rows[0];
      if (!row) return res.status(404).send("Carousel not found.");

      const carouselData = resolveCarouselData(row.carousel_a_json);
      if (!carouselData) return res.status(404).send("Carousel data not available.");

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(buildCarouselPage(carouselData));
    } catch (err) {
      req.log?.error?.({ event: "hyrox.carousel_failed", err: err?.message }, "Carousel render failed");
      return res.status(500).send("Unable to load carousel.");
    }
  };
}

export const hyroxCarouselHandler = createHyroxCarouselHandler();
