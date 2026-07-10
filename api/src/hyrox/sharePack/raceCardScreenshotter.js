import { screenshotHtml } from "./slideScreenshotter.js";
import { buildRaceCardHtml } from "../reports/raceCardBuilder.js";

/**
 * Generates a 1080×1350 PNG race card from mapped race card data.
 *
 * @param {import('../reports/raceCardDataMapper.js').HyroxRaceCardData} raceCardData
 * @returns {Promise<Buffer>} PNG buffer at 1080×1350 logical pixels
 */
export async function generateRaceCardPng(raceCardData) {
  const html = buildRaceCardHtml(raceCardData);
  return screenshotHtml(html, { width: 1080, height: 1350 });
}
