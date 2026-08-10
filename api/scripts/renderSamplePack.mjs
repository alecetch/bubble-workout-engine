// Renders a local, disk-only copy of the 6-slide Instagram carousel + race card for an existing
// hyrox_submissions row — no S3 upload, no ZIP, no email, no hyrox_share_packs write. This mirrors
// the rendering half of sharePackService.getOrCreateSharePack() (carousel HTML build -> screenshot,
// race-card data build -> screenshot) without any of its persistence/delivery side effects, so it's
// safe to re-run repeatedly against a real submissionId for visual QA (mobile-readability review,
// before/after comparison, etc.) without touching production state.
//
// Usage: node scripts/renderSamplePack.mjs <submissionId> <outputDir>

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "../src/db.js";
import { buildCarouselPage, resolveCarouselData } from "../src/hyrox/reports/carouselPageBuilder.js";
import { buildTemplateA } from "../src/hyrox/reports/templateSlotMapper.js";
import { rankInsightsForOutput } from "../src/hyrox/reports/insightRanker.js";
import { resolveConflicts } from "../src/hyrox/reports/conflictResolver.js";
import { buildHyroxReportContract } from "../src/hyrox/reports/reportContractBuilder.js";
import { buildHyroxRaceCardData } from "../src/hyrox/reports/raceCardDataMapper.js";
import { buildRaceCardHtml } from "../src/hyrox/reports/raceCardBuilder.js";
import { launchBrowser, screenshotSlides, screenshotHtml } from "../src/hyrox/sharePack/slideScreenshotter.js";
import { SLIDE_FILENAMES } from "../src/hyrox/sharePack/slideAssets.js";

function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function athleteContext(row, storedCarousel) {
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

async function fetchRow(submissionId) {
  const { rows } = await pool.query(
    `SELECT a.carousel_a_json, a.analysis_json, a.selected_insights_json,
            s.display_name, s.race_name, s.division, s.calculator_mode,
            s.athlete_context_json, s.performance_context_json
     FROM hyrox_analyses a
     JOIN hyrox_submissions s ON s.id = a.submission_id
     WHERE a.submission_id = $1
     ORDER BY a.created_at DESC LIMIT 1`,
    [submissionId],
  );
  return rows[0] ?? null;
}

async function main() {
  const [submissionId, outDirArg] = process.argv.slice(2);
  if (!submissionId) {
    console.error("Usage: node scripts/renderSamplePack.mjs <submissionId> [outputDir]");
    process.exitCode = 1;
    return;
  }
  const outDir = outDirArg ?? join("..", "docs", "social", "mobile-review", submissionId);
  await mkdir(outDir, { recursive: true });

  const row = await fetchRow(submissionId);
  if (!row) throw new Error(`No hyrox_analyses row found for submission ${submissionId}`);

  const analysisJson = objectOrNull(row.analysis_json) ?? {};
  const ctx = athleteContext(row, row.carousel_a_json);
  const rawInsights = Array.isArray(row.selected_insights_json) ? row.selected_insights_json : [];
  const insights = resolveConflicts(rankInsightsForOutput(rawInsights, "carousel_a"), "carousel_a");
  const contract = buildHyroxReportContract({ analysisJson, athleteContext: ctx, calculatorMode: row.calculator_mode, insights });

  const carouselData = analysisJson.analysisScope !== "no_benchmark_data"
    ? buildTemplateA(analysisJson, insights, ctx, contract)
    : resolveCarouselData(row.carousel_a_json);
  if (!carouselData) throw new Error("No carousel data available for this submission");

  const carouselHtml = buildCarouselPage(carouselData);
  const raceCardData = buildHyroxRaceCardData(analysisJson, ctx, contract);
  const raceCardHtml = buildRaceCardHtml(raceCardData);

  console.log(`Rendering sample pack for "${ctx.displayName}" (submission ${submissionId}) -> ${outDir}`);
  const browser = await launchBrowser();
  try {
    const slideBuffers = await screenshotSlides(carouselHtml, browser);
    for (let i = 0; i < slideBuffers.length; i++) {
      await writeFile(join(outDir, SLIDE_FILENAMES[i]), slideBuffers[i]);
      console.log(`  [OK] ${SLIDE_FILENAMES[i]}`);
    }
    const raceCardBuffer = await screenshotHtml(raceCardHtml, { width: 1080, height: 1350 }, browser);
    await writeFile(join(outDir, "race-card.png"), raceCardBuffer);
    console.log("  [OK] race-card.png");
  } finally {
    await browser.close();
  }
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
