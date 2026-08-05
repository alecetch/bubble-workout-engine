import { pool } from "../db.js";
import { getOrCreateRaceCard as getOrCreateRaceCardDefault } from "./sharePack/sharePackService.js";
import { getObject as getObjectDefault } from "../services/s3Service.js";

export function createHyroxRaceCardHandler(db = pool, deps = {}) {
  const getOrCreateRaceCard = deps.getOrCreateRaceCard ?? getOrCreateRaceCardDefault;
  const getObject = deps.getObject ?? getObjectDefault;

  return async function hyroxRaceCardHandler(req, res) {
    const { submissionId } = req.params;
    const { download } = req.query;
    const sessionId = typeof req.query?.sessionId === "string" ? req.query.sessionId : null;

    let raceCardKey;
    let buffer;
    try {
      ({ raceCardKey, buffer } = await getOrCreateRaceCard(submissionId, db, { sessionId }));
      if (!buffer) buffer = await getObject(raceCardKey);
    } catch (err) {
      req.log?.error?.({ event: "hyrox.race_card_generation_failed", err: err?.message });
      const status = err.status ?? 500;
      return res.status(status).send(status === 404 ? "Race card not found." : "Race card generation failed.");
    }

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store");
    if (download === "1") {
      res.set("Content-Disposition", 'attachment; filename="race-card.png"');
    }
    return res.send(buffer);
  };
}

export const hyroxRaceCardHandler = createHyroxRaceCardHandler();
