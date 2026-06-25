import { pool } from "../../db.js";
import { buildCarouselPage, resolveCarouselData } from "../reports/carouselPageBuilder.js";
import { buildTemplateA } from "../reports/templateSlotMapper.js";
import { buildCaption } from "./captionBuilder.js";
import { screenshotSlides } from "./slideScreenshotter.js";
import { buildZip } from "./zipBuilder.js";
import { SLIDE_FILENAMES } from "./slideAssets.js";
import { putObject, getPresignedUrl } from "../../services/s3Service.js";

export const SHARE_PACK_TTL_SECONDS = 7 * 24 * 60 * 60;

function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function toSlug(str = "") {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "hyrox";
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

function resolveShareCarousel(row = {}) {
  const analysisJson = objectOrNull(row.analysis_json);
  if (analysisJson && analysisJson.analysisScope !== "no_benchmark_data") {
    const insights = Array.isArray(row.selected_insights_json) ? row.selected_insights_json : [];
    return buildTemplateA(analysisJson, insights, athleteContext(row, row.carousel_a_json));
  }
  return resolveCarouselData(row.carousel_a_json);
}

export async function getOrCreateSharePack(submissionId, db = pool) {
  const existing = await db.query(
    `SELECT * FROM hyrox_share_packs
     WHERE submission_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [submissionId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const dataRow = await db.query(
    `SELECT a.carousel_a_json,
            a.analysis_json,
            a.selected_insights_json,
            s.display_name,
            s.race_name,
            s.division,
            s.calculator_mode,
            s.athlete_context_json,
            s.performance_context_json
     FROM hyrox_analyses a
     JOIN hyrox_submissions s ON s.id = a.submission_id
     WHERE a.submission_id = $1 LIMIT 1`,
    [submissionId],
  );
  const row = dataRow.rows[0];
  if (!row) throw Object.assign(new Error("Submission not found"), { status: 404 });

  const carouselData = resolveShareCarousel(row);
  if (!carouselData) throw Object.assign(new Error("Carousel data unavailable"), { status: 404 });

  const caption = buildCaption({
    slide0: carouselData.slides?.[0] ?? {},
    athleteContext: athleteContext(row, row.carousel_a_json),
    analysisJson: objectOrNull(row.analysis_json) ?? {},
  });

  const html = buildCarouselPage(carouselData);
  const slideBuffers = await screenshotSlides(html);
  if (slideBuffers.length !== SLIDE_FILENAMES.length) {
    throw new Error(`Expected ${SLIDE_FILENAMES.length} slides, received ${slideBuffers.length}`);
  }

  const slidePrefix = `hyrox-share-packs/${submissionId}/`;
  await Promise.all(
    slideBuffers.map((buf, index) => putObject(`${slidePrefix}${SLIDE_FILENAMES[index]}`, buf, "image/png")),
  );

  const zipBuffer = await buildZip(slideBuffers, caption);
  const athleteSlug = toSlug(row.display_name);
  const eventSlug = toSlug(row.race_name);
  const zipFilename = `forma-hyrox-${athleteSlug}-${eventSlug}.zip`;
  const zipKey = `${slidePrefix}${zipFilename}`;
  await putObject(zipKey, zipBuffer, "application/zip");

  const expiresAt = new Date(Date.now() + SHARE_PACK_TTL_SECONDS * 1000).toISOString();
  const inserted = await db.query(
    `INSERT INTO hyrox_share_packs (submission_id, zip_key, caption, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [submissionId, zipKey, caption, expiresAt],
  );
  return inserted.rows[0];
}

export async function getPackDownloadUrl(pack) {
  return getPresignedUrl(pack.zip_key, SHARE_PACK_TTL_SECONDS);
}
