import { pool } from "../../db.js";
import { buildCarouselPage, resolveCarouselData } from "../reports/carouselPageBuilder.js";
import { buildTemplateA } from "../reports/templateSlotMapper.js";
import { rankInsightsForOutput } from "../reports/insightRanker.js";
import { resolveConflicts } from "../reports/conflictResolver.js";
import { buildCaption } from "./captionBuilder.js";
import { screenshotSlides, launchBrowser } from "./slideScreenshotter.js";
import { generateRaceCardPng } from "./raceCardScreenshotter.js";
import { buildHyroxRaceCardData } from "../reports/raceCardDataMapper.js";
import { buildHyroxReportContract } from "../reports/reportContractBuilder.js";
import { buildZip } from "./zipBuilder.js";
import { SLIDE_FILENAMES } from "./slideAssets.js";
import { putObject, getPresignedUrl, getObject } from "../../services/s3Service.js";

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

export async function screenshotSlidesWithRetry(html, { attempts = 2, render = screenshotSlides } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await render(html);
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line no-console
      console.error(`[sharePackService] Slide screenshot attempt ${attempt}/${attempts} failed:`, err?.message);
    }
  }
  throw Object.assign(
    new Error(`Slide rendering failed after ${attempts} attempt(s): ${lastErr?.message}`),
    { status: 502, cause: lastErr },
  );
}

function resolveShareCarousel(row = {}, contract = null) {
  const analysisJson = objectOrNull(row.analysis_json);
  if (analysisJson && analysisJson.analysisScope !== "no_benchmark_data") {
    const raw = Array.isArray(row.selected_insights_json) ? row.selected_insights_json : [];
    const insights = resolveConflicts(rankInsightsForOutput(raw, "carousel_a"), "carousel_a");
    return buildTemplateA(analysisJson, insights, athleteContext(row, row.carousel_a_json), contract);
  }
  return resolveCarouselData(row.carousel_a_json);
}

async function fetchSubmissionAnalysisRow(submissionId, db) {
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
  return dataRow.rows[0] ?? null;
}

// Contract-aware race-card renderer shared by the full share-pack build and the standalone
// race-card cache, so both endpoints render an identical card for the same submission.
async function renderRaceCardBuffer(row, sharedBrowser = null) {
  const rawAnalysisJson = objectOrNull(row.analysis_json);
  if (!rawAnalysisJson) return null;
  const ctx = athleteContext(row, row.carousel_a_json);
  const rawInsights = Array.isArray(row.selected_insights_json) ? row.selected_insights_json : [];
  const insights = resolveConflicts(rankInsightsForOutput(rawInsights, "carousel_a"), "carousel_a");
  const contract = buildHyroxReportContract({ analysisJson: rawAnalysisJson, athleteContext: ctx, calculatorMode: row.calculator_mode, insights });
  const raceCardData = buildHyroxRaceCardData(rawAnalysisJson, ctx, contract);
  return generateRaceCardPng(raceCardData, sharedBrowser);
}

async function findCachedRaceCardKey(submissionId, db) {
  const cached = await db.query(
    `SELECT race_card_key FROM hyrox_share_packs
     WHERE submission_id = $1 AND race_card_key IS NOT NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [submissionId],
  );
  return cached.rows[0]?.race_card_key ?? null;
}

// Caches just the race card (no ZIP/slides) so the standalone race-card endpoint doesn't have to
// launch Puppeteer on every request. Reuses the same S3 key convention and hyrox_share_packs TTL
// row shape as getOrCreateSharePack, so a later full-pack request can reuse whichever was built first.
// `deps` overrides are injection points for unit tests only — real callers use the module defaults.
export async function getOrCreateRaceCard(submissionId, db = pool, deps = {}) {
  const putObjectFn = deps.putObject ?? putObject;
  const renderRaceCard = deps.renderRaceCardBuffer ?? renderRaceCardBuffer;

  const cachedKey = await findCachedRaceCardKey(submissionId, db);
  if (cachedKey) return { raceCardKey: cachedKey, buffer: null };

  const row = await fetchSubmissionAnalysisRow(submissionId, db);
  if (!row) throw Object.assign(new Error("Submission not found"), { status: 404 });

  const buffer = await renderRaceCard(row);
  if (!buffer) throw Object.assign(new Error("Race card not available for this submission"), { status: 404 });

  const raceCardKey = `hyrox-share-packs/${submissionId}/race-card.png`;
  await putObjectFn(raceCardKey, buffer, "image/png");

  const expiresAt = new Date(Date.now() + SHARE_PACK_TTL_SECONDS * 1000).toISOString();
  await db.query(
    `INSERT INTO hyrox_share_packs (submission_id, race_card_key, expires_at)
     VALUES ($1, $2, $3)`,
    [submissionId, raceCardKey, expiresAt],
  );

  return { raceCardKey, buffer };
}

export async function getOrCreateSharePack(submissionId, db = pool, deps = {}) {
  const putObjectFn = deps.putObject ?? putObject;
  const getObjectFn = deps.getObject ?? getObject;
  const renderSlides = deps.screenshotSlides ?? screenshotSlides;
  const renderRaceCard = deps.renderRaceCardBuffer ?? renderRaceCardBuffer;
  const launch = deps.launchBrowser ?? launchBrowser;

  const existing = await db.query(
    `SELECT * FROM hyrox_share_packs
     WHERE submission_id = $1 AND zip_key IS NOT NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [submissionId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const row = await fetchSubmissionAnalysisRow(submissionId, db);
  if (!row) throw Object.assign(new Error("Submission not found"), { status: 404 });

  const rawAnalysisJson = objectOrNull(row.analysis_json);
  const analysisJson = rawAnalysisJson ?? {};
  const ctx = athleteContext(row, row.carousel_a_json);
  const rawInsights = Array.isArray(row.selected_insights_json) ? row.selected_insights_json : [];
  const insights = resolveConflicts(rankInsightsForOutput(rawInsights, "carousel_a"), "carousel_a");
  const contract = buildHyroxReportContract({ analysisJson, athleteContext: ctx, calculatorMode: row.calculator_mode, insights });
  const carouselData = resolveShareCarousel(row, contract);
  if (!carouselData) throw Object.assign(new Error("Carousel data unavailable"), { status: 404 });

  const caption = buildCaption({
    slide0: carouselData.slides?.[0] ?? {},
    athleteContext: ctx,
    analysisJson,
    contract,
  });

  const html = buildCarouselPage(carouselData);
  const slidePrefix = `hyrox-share-packs/${submissionId}/`;

  // Launch one Chrome instance and share it across the slide render and the race-card render —
  // the spec for this feature always called for a shared browser instance; launching two
  // separate ones (the previous behavior here) was a regression against that design.
  const browser = await launch();
  let slideBuffers;
  let raceCardBuffer = null;
  let raceCardKey = null;
  try {
    slideBuffers = await screenshotSlidesWithRetry(html, { render: (h) => renderSlides(h, browser) });
    if (slideBuffers.length !== SLIDE_FILENAMES.length) {
      throw new Error(`Expected ${SLIDE_FILENAMES.length} slides, received ${slideBuffers.length}`);
    }

    await Promise.all(
      slideBuffers.map((buf, index) => putObjectFn(`${slidePrefix}${SLIDE_FILENAMES[index]}`, buf, "image/png")),
    );

    // Generate race card PNG; failure must not block the ZIP delivery. Reuse an already-cached
    // race card (e.g. from a prior standalone preview request) instead of re-rendering when one exists.
    try {
      raceCardKey = await findCachedRaceCardKey(submissionId, db);
      if (raceCardKey) {
        // Fetch the already-rendered bytes instead of relaunching Puppeteer — the ZIP still needs
        // the actual buffer, just not a fresh render.
        raceCardBuffer = await getObjectFn(raceCardKey);
      } else if (rawAnalysisJson) {
        raceCardBuffer = await renderRaceCard(row, browser);
        if (raceCardBuffer) {
          raceCardKey = `${slidePrefix}race-card.png`;
          await putObjectFn(raceCardKey, raceCardBuffer, "image/png");
        }
      }
    } catch (raceCardErr) {
      // eslint-disable-next-line no-console
      console.error("[sharePackService] Race card generation failed — continuing without it:", raceCardErr?.message);
    }
  } finally {
    await browser.close();
  }

  const zipBuffer = await buildZip(slideBuffers, caption, { raceCardBuffer });
  const athleteSlug = toSlug(row.display_name);
  const eventSlug = toSlug(row.race_name);
  const zipFilename = `forma-hyrox-${athleteSlug}-${eventSlug}.zip`;
  const zipKey = `${slidePrefix}${zipFilename}`;
  await putObjectFn(zipKey, zipBuffer, "application/zip");

  const expiresAt = new Date(Date.now() + SHARE_PACK_TTL_SECONDS * 1000).toISOString();
  const inserted = await db.query(
    `INSERT INTO hyrox_share_packs (submission_id, zip_key, race_card_key, caption, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [submissionId, zipKey, raceCardKey, caption, expiresAt],
  );
  return inserted.rows[0];
}

export async function getPackDownloadUrl(pack) {
  return getPresignedUrl(pack.zip_key, SHARE_PACK_TTL_SECONDS);
}
