import express from "express";
import { pool } from "../db.js";
import { parseRaceResultsCsv } from "../contentStudio/csvParser.js";
import { analyseRaceEvent } from "../contentStudio/raceEventAnalyser.js";
import { generateContentInsights } from "../contentStudio/contentInsightEngine.js";
import { generateContentForMode } from "../contentStudio/contentModeDispatcher.js";
import { generateCaption } from "../contentStudio/captionGenerator.js";
import { fetchDivisions, scrapeLeaderboard } from "../contentStudio/hyroxScraper.js";

export const adminContentStudioRouter = express.Router();

const csvTextParser = express.text({ type: ["text/csv", "text/plain", "application/csv"], limit: "1mb" });

function cleanString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normaliseHandle(value) {
  const text = cleanString(value)?.toLowerCase();
  if (!text) return null;
  return text.startsWith("@") ? text : `@${text}`;
}

function parseIntOrNull(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function raceSummary(row) {
  return {
    id: row.id,
    eventName: row.event_name,
    eventDate: row.event_date,
    season: row.season,
    division: row.division,
    sex: row.sex,
    athleteCount: row.athlete_count,
    status: row.status,
    createdAt: row.created_at,
  };
}

adminContentStudioRouter.post("/content-studio/races/upload", csvTextParser, async (req, res) => {
  const eventName = cleanString(req.query.eventName ?? req.query.event_name ?? req.headers["x-event-name"]);
  const eventDate = cleanString(req.query.eventDate ?? req.query.event_date);
  const division = cleanString(req.query.division) ?? "open";
  const sex = cleanString(req.query.sex) ?? "male";
  const season = parseIntOrNull(req.query.season);
  const uploadedBy = cleanString(req.query.uploadedBy ?? req.query.uploaded_by);

  if (!eventName) return res.status(400).json({ ok: false, error: "eventName is required" });
  if (!req.body || typeof req.body !== "string") return res.status(400).json({ ok: false, error: "CSV body is required" });

  try {
    const parsed = parseRaceResultsCsv(req.body, division, sex);
    const analysis = await analyseRaceEvent(parsed.rows, division, sex, pool);
    const result = await pool.query(
      `INSERT INTO cs_race_events (
        event_name, event_date, season, division, sex, uploaded_by,
        athlete_count, raw_data_json, analysis_json, status
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, 'analysed')
       RETURNING *`,
      [
        eventName,
        eventDate,
        season,
        division,
        sex,
        uploadedBy,
        parsed.rows.length,
        JSON.stringify(parsed.rows),
        JSON.stringify(analysis),
      ],
    );
    return res.json({ ok: true, raceEventId: result.rows[0].id, status: "analysed", warnings: parsed.warnings, race: raceSummary(result.rows[0]) });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.get("/content-studio/races", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, event_name, event_date, season, division, sex, athlete_count, status, created_at
       FROM cs_race_events
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    return res.json({ ok: true, races: result.rows.map(raceSummary) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.get("/content-studio/races/:raceEventId", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM cs_race_events WHERE id = $1", [req.params.raceEventId]);
    if (!result.rows.length) return res.status(404).json({ ok: false, error: "Race event not found" });
    const row = result.rows[0];
    return res.json({
      ok: true,
      race: raceSummary(row),
      rawRows: row.raw_data_json,
      analysis: row.analysis_json,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.post("/content-studio/races/:raceEventId/auto-pick", async (req, res) => {
  try {
    const raceResult = await pool.query("SELECT * FROM cs_race_events WHERE id = $1", [req.params.raceEventId]);
    if (!raceResult.rows.length) return res.status(404).json({ ok: false, error: "Race event not found" });
    const race = raceResult.rows[0];
    const analysis = race.analysis_json ?? await analyseRaceEvent(race.raw_data_json, race.division, race.sex, pool);
    const insights = generateContentInsights(analysis);

    const jobResult = await pool.query(
      `INSERT INTO cs_content_jobs (race_event_id, content_mode, status, generated_content_json, generated_at)
       VALUES ($1, 'auto_pick', 'draft', $2::jsonb, now())
       RETURNING id`,
      [race.id, JSON.stringify({ insights })],
    );
    await pool.query(
      `INSERT INTO cs_content_items (job_id, item_type, insights_json)
       VALUES ($1, 'insight_summary', $2::jsonb)`,
      [jobResult.rows[0].id, JSON.stringify(insights)],
    );

    return res.json({ ok: true, raceEventId: race.id, jobId: jobResult.rows[0].id, insights });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.get("/content-studio/athletes", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, instagram_handle, instagram_follower_count, sex, division, notes, last_featured_at, created_at, updated_at
       FROM cs_athletes
       ORDER BY created_at DESC
       LIMIT 250`,
    );
    return res.json({ ok: true, athletes: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.post("/content-studio/athletes", express.json(), async (req, res) => {
  const fullName = cleanString(req.body?.fullName ?? req.body?.full_name);
  if (!fullName) return res.status(400).json({ ok: false, error: "fullName is required" });
  try {
    const result = await pool.query(
      `INSERT INTO cs_athletes (full_name, instagram_handle, instagram_follower_count, sex, division, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        fullName,
        normaliseHandle(req.body?.instagramHandle ?? req.body?.instagram_handle),
        parseIntOrNull(req.body?.instagramFollowerCount ?? req.body?.instagram_follower_count),
        cleanString(req.body?.sex),
        cleanString(req.body?.division),
        cleanString(req.body?.notes),
      ],
    );
    return res.json({ ok: true, athleteId: result.rows[0].id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.patch("/content-studio/athletes/:athleteId", express.json(), async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const fields = [];
  if ("fullName" in body || "full_name" in body) fields.push(["full_name", cleanString(body.fullName ?? body.full_name)]);
  if ("instagramHandle" in body || "instagram_handle" in body) fields.push(["instagram_handle", normaliseHandle(body.instagramHandle ?? body.instagram_handle)]);
  if ("instagramFollowerCount" in body || "instagram_follower_count" in body) fields.push(["instagram_follower_count", body.instagramFollowerCount ?? body.instagram_follower_count]);
  if ("sex" in body) fields.push(["sex", cleanString(body.sex)]);
  if ("division" in body) fields.push(["division", cleanString(body.division)]);
  if ("notes" in body) fields.push(["notes", cleanString(body.notes)]);
  if (!fields.length) return res.status(400).json({ ok: false, error: "No patch fields supplied" });

  const assignments = fields.map(([key], index) => `${key} = $${index + 1}`);
  const values = fields.map(([key, value]) => key === "instagram_follower_count" ? parseIntOrNull(value) : value);
  values.push(req.params.athleteId);
  try {
    const result = await pool.query(
      `UPDATE cs_athletes
       SET ${assignments.join(", ")}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING id`,
      values,
    );
    if (!result.rows.length) return res.status(404).json({ ok: false, error: "Athlete not found" });
    return res.json({ ok: true, athleteId: result.rows[0].id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.delete("/content-studio/athletes/:athleteId", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM cs_athletes WHERE id = $1 RETURNING id", [req.params.athleteId]);
    if (!result.rows.length) return res.status(404).json({ ok: false, error: "Athlete not found" });
    return res.json({ ok: true, athleteId: result.rows[0].id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.post("/content-studio/races/:raceEventId/generate", express.json(), async (req, res) => {
  const { mode, params: modeParams = {} } = req.body ?? {};
  if (!mode) return res.status(400).json({ ok: false, error: "mode required" });

  try {
    const raceRow = await pool.query("SELECT * FROM cs_race_events WHERE id = $1", [req.params.raceEventId]);
    if (!raceRow.rows.length) return res.status(404).json({ ok: false, error: "Race event not found" });
    const raceEvent = raceRow.rows[0];
    if (!raceEvent.analysis_json) return res.status(400).json({ ok: false, error: "Race not yet analysed - run auto-pick first" });

    const athletes = (await pool.query("SELECT * FROM cs_athletes ORDER BY full_name")).rows;
    const raceAnalysis = {
      ...raceEvent.analysis_json,
      _insights: generateContentInsights(raceEvent.analysis_json),
    };
    const generatedContent = await generateContentForMode(mode, raceAnalysis, modeParams, athletes);
    const { caption, handles, hashtags } = generateCaption(generatedContent, raceEvent, athletes);
    generatedContent.captionDraft = caption;
    generatedContent.suggestedHandles = handles;
    generatedContent.suggestedHashtags = hashtags;

    const jobResult = await pool.query(
      `INSERT INTO cs_content_jobs (race_event_id, content_mode, mode_params_json, generated_content_json, generated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, now())
       RETURNING id, status`,
      [req.params.raceEventId, mode, JSON.stringify(modeParams), JSON.stringify(generatedContent)],
    );
    const jobId = jobResult.rows[0].id;
    await pool.query(
      `INSERT INTO cs_content_items (job_id, item_type, insights_json, carousel_json, caption_text, hashtags, athlete_handles)
       VALUES ($1, 'carousel', $2::jsonb, $3::jsonb, $4, $5, $6)`,
      [
        jobId,
        JSON.stringify(generatedContent.selectedInsights ?? []),
        JSON.stringify({ slides: generatedContent.carouselSlides }),
        caption,
        hashtags,
        handles,
      ],
    );

    return res.json({ ok: true, jobId, status: jobResult.rows[0].status, ...generatedContent });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.get("/content-studio/jobs", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT j.id, j.content_mode, j.status, j.created_at, j.generated_at, j.approved_at,
              j.generated_content_json->>'headline' AS headline,
              e.event_name, e.division, e.sex
       FROM cs_content_jobs j
       LEFT JOIN cs_race_events e ON e.id = j.race_event_id
       ORDER BY j.created_at DESC
       LIMIT 100`,
    );
    return res.json({ ok: true, jobs: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.get("/content-studio/jobs/:jobId", async (req, res) => {
  try {
    const job = await pool.query("SELECT * FROM cs_content_jobs WHERE id = $1", [req.params.jobId]);
    if (!job.rows.length) return res.status(404).json({ ok: false, error: "Job not found" });
    const items = await pool.query("SELECT * FROM cs_content_items WHERE job_id = $1", [req.params.jobId]);
    return res.json({ ok: true, job: job.rows[0], items: items.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.patch("/content-studio/jobs/:jobId/submit", async (req, res) => {
  await transitionJob(req, res, "draft", "pending_review");
});

adminContentStudioRouter.patch("/content-studio/jobs/:jobId/approve", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT status FROM cs_content_jobs WHERE id = $1", [req.params.jobId]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "Job not found" });
    if (rows[0].status !== "pending_review") return res.status(400).json({ ok: false, error: `Cannot approve from status "${rows[0].status}"` });
    await pool.query(
      "UPDATE cs_content_jobs SET status = $1, approved_at = now(), approved_by = $2, updated_at = now() WHERE id = $3",
      ["approved", "[masked]", req.params.jobId],
    );
    return res.json({ ok: true, status: "approved" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.patch("/content-studio/jobs/:jobId/reject", async (req, res) => {
  await transitionJob(req, res, "pending_review", "draft", "reject");
});

adminContentStudioRouter.get("/content-studio/jobs/:jobId/export", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM cs_content_jobs WHERE id = $1", [req.params.jobId]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "Job not found" });
    if (rows[0].status !== "approved") return res.status(400).json({ ok: false, error: `Cannot export from status "${rows[0].status}"` });

    const items = await pool.query("SELECT * FROM cs_content_items WHERE job_id = $1", [req.params.jobId]);
    const carouselItem = items.rows.find((item) => item.item_type === "carousel");
    await pool.query("UPDATE cs_content_jobs SET status = $1, updated_at = now() WHERE id = $2", ["exported", req.params.jobId]);
    await pool.query("UPDATE cs_content_items SET export_status = $1 WHERE job_id = $2", ["exported", req.params.jobId]);

    const exportPayload = {
      jobId: rows[0].id,
      contentMode: rows[0].content_mode,
      carouselJson: carouselItem?.carousel_json ?? null,
      captionText: carouselItem?.caption_text ?? "",
      hashtags: carouselItem?.hashtags ?? [],
      athleteHandles: carouselItem?.athlete_handles ?? [],
      exportedAt: new Date().toISOString(),
    };
    res.setHeader("Content-Disposition", `attachment; filename="forma-content-${rows[0].id.slice(0, 8)}.json"`);
    return res.json(exportPayload);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── HYROX results scraping ─────────────────────────────────────────────────────

adminContentStudioRouter.get("/content-studio/hyrox-events", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, season, event_name, city, country, start_date, results_page_key
       FROM hyrox_events
       WHERE has_results = true AND results_page_key IS NOT NULL
       ORDER BY start_date DESC NULLS LAST, season DESC, event_name`,
    );
    return res.json({
      ok: true,
      events: rows.map((r) => ({
        id: r.id,
        season: r.season,
        eventName: r.event_name,
        city: r.city,
        country: r.country,
        startDate: r.start_date,
        resultsPageKey: r.results_page_key,
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.get("/content-studio/hyrox-events/:resultsPageKey/divisions", async (req, res) => {
  const resultsPageKey = decodeURIComponent(req.params.resultsPageKey);
  const season = req.query.season ? Number(req.query.season) : null;
  try {
    const divisions = await fetchDivisions(resultsPageKey, season);
    return res.json({ ok: true, divisions });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

adminContentStudioRouter.post("/content-studio/hyrox-events/:resultsPageKey/scrape", express.json(), async (req, res) => {
  const resultsPageKey = decodeURIComponent(req.params.resultsPageKey);
  const division = String(req.body?.division ?? "").trim();
  const season = req.body?.season ? Number(req.body.season) : null;
  if (!division) return res.status(400).json({ ok: false, error: "division is required" });

  try {
    const rows = await scrapeLeaderboard(resultsPageKey, division, 50, season);
    if (!rows.length) return res.status(422).json({ ok: false, error: "Scrape returned no rows" });

    const divisionType = rows[0].division;
    const sex = rows[0].sex;
    const analysis = await analyseRaceEvent(rows, divisionType, sex, pool);

    // Look up event metadata from hyrox_events table
    const evRow = await pool.query(
      "SELECT event_name, start_date, season FROM hyrox_events WHERE results_page_key = $1 LIMIT 1",
      [resultsPageKey],
    );
    const eventName = evRow.rows[0]?.event_name ?? resultsPageKey;
    const eventDate = evRow.rows[0]?.start_date ?? null;
    const dbSeason = evRow.rows[0]?.season ?? season; // prefer DB value, fall back to request value

    const result = await pool.query(
      `INSERT INTO cs_race_events (
        event_name, event_date, season, division, sex,
        athlete_count, raw_data_json, analysis_json, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'analysed')
       RETURNING *`,
      [
        `${eventName} — ${division}`,
        eventDate,
        dbSeason,
        divisionType,
        sex,
        rows.length,
        JSON.stringify(rows),
        JSON.stringify(analysis),
      ],
    );

    return res.json({
      ok: true,
      raceEventId: result.rows[0].id,
      athleteCount: rows.length,
      division: divisionType,
      sex,
      eventName: result.rows[0].event_name,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

async function transitionJob(req, res, fromStatus, toStatus, verb = "submit") {
  try {
    const { rows } = await pool.query("SELECT status FROM cs_content_jobs WHERE id = $1", [req.params.jobId]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "Job not found" });
    if (rows[0].status !== fromStatus) {
      return res.status(400).json({ ok: false, error: `Cannot ${verb} from status "${rows[0].status}"` });
    }
    await pool.query("UPDATE cs_content_jobs SET status = $1, updated_at = now() WHERE id = $2", [toStatus, req.params.jobId]);
    return res.json({ ok: true, status: toStatus });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
