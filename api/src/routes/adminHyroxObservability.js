import express from "express";
import { requireInternalToken } from "../middleware/auth.js";
import { publicInternalError } from "../utils/publicError.js";
import { clampInt, safeString } from "../utils/validate.js";

function roundPct(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

function numberOrNull(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toIsoDateUtc(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function withPct(rows, keyName) {
  const normalized = (rows ?? []).map((row) => ({
    [keyName]: row[keyName] ?? "unknown",
    count: Number(row.count ?? 0),
  }));
  const total = normalized.reduce((sum, row) => sum + row.count, 0);
  return normalized.map((row) => ({ ...row, pct: roundPct(row.count, total) }));
}

function fillDailyTrend(days, rows) {
  const byDate = new Map(
    (rows ?? []).map((row) => {
      const submissions = Number(row.submissions ?? 0);
      const successfulAnalyses = Number(row.successful_analyses ?? row.successfulAnalyses ?? 0);
      return [
        toIsoDateUtc(row.date),
        {
          date: toIsoDateUtc(row.date),
          submissions,
          successfulAnalyses,
          failedAnalyses: Math.max(0, submissions - successfulAnalyses),
        },
      ];
    }),
  );

  const out = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(byDate.get(key) ?? { date: key, submissions: 0, successfulAnalyses: 0, failedAnalyses: 0 });
  }
  return out;
}

function rowTotal(rows) {
  const first = rows?.[0];
  return first ? Number(first.total_count ?? 0) : 0;
}

export function createAdminHyroxObservabilityRouter(db) {
  const router = express.Router();
  router.use(requireInternalToken);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/summary", async (req, res) => {
    const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

    try {
      const [submissionsResult, analysesResult, emailResult, shareResult, durationResult] = await Promise.all([
        db.query(
          `
          SELECT COUNT(*)::int AS submissions
          FROM hyrox_submissions
          WHERE created_at > now() - ($1 * interval '1 day')
          `,
          [days],
        ),
        db.query(
          `
          SELECT COUNT(*)::int AS successful_analyses
          FROM hyrox_analyses ha
          JOIN hyrox_submissions hs ON hs.id = ha.submission_id
          WHERE hs.created_at > now() - ($1 * interval '1 day')
          `,
          [days],
        ),
        db.query(
          `
          SELECT
            COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
            COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
          FROM hyrox_email_log el
          JOIN hyrox_submissions hs ON hs.id = el.submission_id
          WHERE hs.created_at > now() - ($1 * interval '1 day')
          `,
          [days],
        ),
        db.query(
          `
          SELECT COUNT(*)::int AS generated
          FROM hyrox_share_packs sp
          JOIN hyrox_submissions hs ON hs.id = sp.submission_id
          WHERE hs.created_at > now() - ($1 * interval '1 day')
          `,
          [days],
        ),
        db.query(
          `
          SELECT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY analysis_duration_ms) AS p50,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY analysis_duration_ms) AS p95
          FROM hyrox_submissions
          WHERE created_at > now() - ($1 * interval '1 day')
            AND analysis_duration_ms IS NOT NULL
          `,
          [days],
        ),
      ]);

      const submissions = Number(submissionsResult.rows?.[0]?.submissions ?? 0);
      const successfulAnalyses = Number(analysesResult.rows?.[0]?.successful_analyses ?? 0);
      const email = emailResult.rows?.[0] ?? {};
      const emailQueued = Number(email.queued ?? 0);
      const emailSent = Number(email.sent ?? 0);
      const emailFailed = Number(email.failed ?? 0);
      const sharePacksGenerated = Number(shareResult.rows?.[0]?.generated ?? 0);
      const durations = durationResult.rows?.[0] ?? {};

      return res.json({
        submissions,
        successfulAnalyses,
        analysisSuccessPct: roundPct(successfulAnalyses, submissions),
        emailQueued,
        emailSent,
        emailFailed,
        emailSentPct: roundPct(emailSent, emailSent + emailFailed),
        sharePacksGenerated,
        shareActionPct: roundPct(sharePacksGenerated, successfulAnalyses),
        p50AnalysisDurationMs: numberOrNull(durations.p50),
        p95AnalysisDurationMs: numberOrNull(durations.p95),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.get("/analysis-health", async (req, res) => {
    const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

    try {
      const [scopeResult, confidenceResult, divisionResult, modeResult, sourceResult, sexResult, consentResult] = await Promise.all([
        db.query(
          `
          SELECT COALESCE(ha.analysis_scope, 'unknown') AS scope, COUNT(*)::int AS count
          FROM hyrox_submissions hs
          LEFT JOIN hyrox_analyses ha ON ha.submission_id = hs.id
          WHERE hs.created_at > now() - ($1 * interval '1 day')
          GROUP BY 1 ORDER BY count DESC
          `,
          [days],
        ),
        db.query(
          `
          SELECT COALESCE(ha.confidence, 'none') AS confidence, COUNT(*)::int AS count
          FROM hyrox_submissions hs
          LEFT JOIN hyrox_analyses ha ON ha.submission_id = hs.id
          WHERE hs.created_at > now() - ($1 * interval '1 day')
          GROUP BY 1 ORDER BY count DESC
          `,
          [days],
        ),
        db.query(
          `
          SELECT division, COUNT(*)::int AS count
          FROM hyrox_submissions
          WHERE created_at > now() - ($1 * interval '1 day')
          GROUP BY 1 ORDER BY count DESC
          `,
          [days],
        ),
        db.query(
          `
          SELECT COALESCE(calculator_mode, 'unknown') AS mode, COUNT(*)::int AS count
          FROM hyrox_submissions
          WHERE created_at > now() - ($1 * interval '1 day')
          GROUP BY 1 ORDER BY count DESC
          `,
          [days],
        ),
        db.query(
          `
          SELECT source, COUNT(*)::int AS count
          FROM hyrox_submissions
          WHERE created_at > now() - ($1 * interval '1 day')
          GROUP BY 1 ORDER BY count DESC
          `,
          [days],
        ),
        db.query(
          `
          SELECT sex, COUNT(*)::int AS count
          FROM hyrox_submissions
          WHERE created_at > now() - ($1 * interval '1 day')
          GROUP BY 1 ORDER BY count DESC
          `,
          [days],
        ),
        db.query(
          `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE marketing_consent = true)::int AS consented
          FROM hyrox_submissions
          WHERE created_at > now() - ($1 * interval '1 day')
          `,
          [days],
        ),
      ]);

      const consent = consentResult.rows?.[0] ?? {};
      const consentTotal = Number(consent.total ?? 0);
      const consented = Number(consent.consented ?? 0);

      return res.json({
        scopeMix: withPct(scopeResult.rows, "scope"),
        confidenceMix: withPct(confidenceResult.rows, "confidence"),
        divisionMix: withPct(divisionResult.rows, "division"),
        modeMix: withPct(modeResult.rows, "mode"),
        sourceMix: withPct(sourceResult.rows, "source"),
        sexMix: withPct(sexResult.rows, "sex"),
        marketingConsentPct: roundPct(consented, consentTotal),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.get("/email", async (req, res) => {
    const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

    try {
      const result = await db.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE el.status = 'queued')::int AS queued,
          COUNT(*) FILTER (WHERE el.status = 'sent')::int AS sent,
          COUNT(*) FILTER (WHERE el.status = 'failed')::int AS failed,
          COUNT(*) FILTER (
            WHERE el.status = 'queued'
              AND hs.created_at < now() - interval '10 minutes'
          )::int AS stale_queued
        FROM hyrox_email_log el
        JOIN hyrox_submissions hs ON hs.id = el.submission_id
        WHERE hs.created_at > now() - ($1 * interval '1 day')
        `,
        [days],
      );

      const row = result.rows?.[0] ?? {};
      const sent = Number(row.sent ?? 0);
      const failed = Number(row.failed ?? 0);

      return res.json({
        queued: Number(row.queued ?? 0),
        sent,
        failed,
        staleQueued: Number(row.stale_queued ?? 0),
        sentPct: roundPct(sent, sent + failed),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.get("/share-pack", async (req, res) => {
    const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

    try {
      const result = await db.query(
        `
        SELECT
          COUNT(*)::int AS generated,
          COUNT(*) FILTER (WHERE zip_key IS NOT NULL)::int AS with_zip
        FROM hyrox_share_packs sp
        JOIN hyrox_submissions hs ON hs.id = sp.submission_id
        WHERE hs.created_at > now() - ($1 * interval '1 day')
        `,
        [days],
      );

      const row = result.rows?.[0] ?? {};
      const generated = Number(row.generated ?? 0);
      const withZip = Number(row.with_zip ?? 0);
      return res.json({ generated, withZip, withoutZip: Math.max(0, generated - withZip) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.get("/share-pipeline", async (req, res) => {
    const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

    try {
      const [analysesResult, eventsResult, packDurationResult, raceCardDurationResult] = await Promise.all([
        db.query(
          `
          SELECT COUNT(*)::int AS completed
          FROM hyrox_analyses ha
          JOIN hyrox_submissions hs ON hs.id = ha.submission_id
          WHERE hs.created_at > now() - ($1 * interval '1 day')
          `,
          [days],
        ),
        db.query(
          `
          SELECT
            COUNT(*) FILTER (WHERE event_name = 'race_card_previewed')::int AS race_card_previewed,
            COUNT(*) FILTER (WHERE event_name = 'pack_requested')::int AS packs_requested,
            COUNT(*) FILTER (WHERE event_name = 'pack_generation_completed')::int AS pack_completed,
            COUNT(*) FILTER (WHERE event_name = 'pack_generation_failed')::int AS pack_failed,
            COUNT(*) FILTER (WHERE event_name = 'pack_generation_completed' AND cache_hit = true)::int AS pack_cache_hits,
            COUNT(*) FILTER (WHERE event_name = 'pack_generation_completed' AND cache_hit IS NOT NULL)::int AS pack_cache_total,
            COUNT(*) FILTER (WHERE event_name = 'race_card_generation_completed')::int AS race_card_completed,
            COUNT(*) FILTER (WHERE event_name = 'race_card_generation_completed' AND cache_hit = true)::int AS race_card_cache_hits,
            COUNT(*) FILTER (WHERE event_name = 'race_card_generation_completed' AND cache_hit IS NOT NULL)::int AS race_card_cache_total,
            COUNT(*) FILTER (WHERE event_name = 'asset_downloaded' AND metadata_json->>'assetType' = 'race_card')::int AS race_card_downloads,
            COUNT(*) FILTER (WHERE event_name = 'asset_downloaded' AND metadata_json->>'assetType' = 'zip')::int AS zip_downloads
          FROM hyrox_calculator_events
          WHERE created_at > now() - ($1 * interval '1 day')
          `,
          [days],
        ),
        db.query(
          `
          SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
          FROM hyrox_calculator_events
          WHERE created_at > now() - ($1 * interval '1 day')
            AND event_name = 'pack_generation_completed'
            AND duration_ms IS NOT NULL
          `,
          [days],
        ),
        db.query(
          `
          SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
          FROM hyrox_calculator_events
          WHERE created_at > now() - ($1 * interval '1 day')
            AND event_name = 'race_card_generation_completed'
            AND duration_ms IS NOT NULL
          `,
          [days],
        ),
      ]);

      const analysesCompleted = Number(analysesResult.rows?.[0]?.completed ?? 0);
      const events = eventsResult.rows?.[0] ?? {};
      const racesCardPreviewed = Number(events.race_card_previewed ?? 0);
      const packsRequested = Number(events.packs_requested ?? 0);
      const packCompleted = Number(events.pack_completed ?? 0);
      const raceCardCompleted = Number(events.race_card_completed ?? 0);

      return res.json({
        analysesCompleted,
        racesCardPreviewed,
        racesCardPreviewedPct: roundPct(racesCardPreviewed, analysesCompleted),
        packsRequested,
        packsRequestedPct: roundPct(packsRequested, analysesCompleted),
        packGeneration: {
          completed: packCompleted,
          failed: Number(events.pack_failed ?? 0),
          cacheHitPct: roundPct(Number(events.pack_cache_hits ?? 0), Number(events.pack_cache_total ?? 0)),
          p95DurationMs: numberOrNull(packDurationResult.rows?.[0]?.p95),
        },
        raceCardGeneration: {
          completed: raceCardCompleted,
          cacheHitPct: roundPct(Number(events.race_card_cache_hits ?? 0), Number(events.race_card_cache_total ?? 0)),
          p95DurationMs: numberOrNull(raceCardDurationResult.rows?.[0]?.p95),
        },
        assetsDownloaded: {
          raceCard: Number(events.race_card_downloads ?? 0),
          zip: Number(events.zip_downloads ?? 0),
        },
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.get("/daily-trend", async (req, res) => {
    const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

    try {
      const result = await db.query(
        `
        SELECT
          DATE(hs.created_at AT TIME ZONE 'UTC') AS date,
          COUNT(*)::int AS submissions,
          COUNT(ha.id)::int AS successful_analyses
        FROM hyrox_submissions hs
        LEFT JOIN hyrox_analyses ha ON ha.submission_id = hs.id
        WHERE hs.created_at > now() - ($1 * interval '1 day')
        GROUP BY 1
        ORDER BY 1 ASC
        `,
        [days],
      );

      return res.json({ daily: fillDailyTrend(days, result.rows) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.get("/submissions", async (req, res) => {
    const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });
    const limit = clampInt(req.query?.limit, { defaultValue: 50, min: 1, max: 200 });
    const offset = clampInt(req.query?.offset, { defaultValue: 0, min: 0, max: 100000 });

    try {
      const result = await db.query(
        `
        SELECT
          hs.id AS submission_id,
          hs.created_at,
          hs.division,
          hs.sex,
          hs.age_group,
          hs.source,
          hs.calculator_mode,
          hs.roxzone_mode,
          jsonb_array_length(hs.splits_json) AS splits_count,
          ha.analysis_scope,
          ha.confidence,
          el.status AS email_status,
          COALESCE(sp.has_share_pack, false) AS has_share_pack,
          COUNT(*) OVER()::int AS total_count
        FROM hyrox_submissions hs
        LEFT JOIN hyrox_analyses ha ON ha.submission_id = hs.id
        LEFT JOIN LATERAL (
          SELECT status
          FROM hyrox_email_log hel
          WHERE hel.submission_id = hs.id
          LIMIT 1
        ) el ON true
        LEFT JOIN LATERAL (
          SELECT true AS has_share_pack
          FROM hyrox_share_packs
          WHERE submission_id = hs.id
          LIMIT 1
        ) sp ON true
        WHERE hs.created_at > now() - ($1 * interval '1 day')
        ORDER BY hs.created_at DESC
        LIMIT $2 OFFSET $3
        `,
        [days, limit, offset],
      );

      const rows = result.rows ?? [];
      return res.json({
        rows: rows.map((row) => ({
          submissionId: row.submission_id,
          createdAt: row.created_at,
          division: row.division,
          sex: row.sex,
          ageGroup: row.age_group,
          source: row.source,
          calculatorMode: row.calculator_mode,
          roxzoneMode: row.roxzone_mode,
          splitsCount: row.splits_count == null ? null : Number(row.splits_count),
          analysisScope: row.analysis_scope,
          confidence: row.confidence,
          emailStatus: row.email_status,
          hasSharePack: row.has_share_pack === true,
        })),
        total: rowTotal(rows),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.get("/submission/:id", async (req, res) => {
    const id = safeString(req.params?.id);
    if (!id) return res.status(404).json({ ok: false, error: "Not found" });

    try {
      const result = await db.query(
        `
        SELECT
          hs.id AS submission_id,
          hs.created_at,
          hs.division,
          hs.sex,
          hs.age_group,
          hs.age_on_race_day,
          hs.finish_time_seconds,
          hs.race_name,
          hs.race_date,
          hs.source,
          hs.calculator_mode,
          hs.roxzone_mode,
          jsonb_array_length(hs.splits_json) AS splits_count,
          hs.marketing_consent,
          hs.analysis_duration_ms,
          hs.request_id,
          ha.analysis_scope,
          ha.analysis_version,
          ha.benchmark_group_key,
          ha.confidence,
          el.status AS email_status,
          COALESCE(sp.has_share_pack, false) AS has_share_pack
        FROM hyrox_submissions hs
        LEFT JOIN hyrox_analyses ha ON ha.submission_id = hs.id
        LEFT JOIN LATERAL (
          SELECT status
          FROM hyrox_email_log hel
          WHERE hel.submission_id = hs.id
          LIMIT 1
        ) el ON true
        LEFT JOIN LATERAL (
          SELECT true AS has_share_pack
          FROM hyrox_share_packs
          WHERE submission_id = hs.id
          LIMIT 1
        ) sp ON true
        WHERE hs.id = $1
        `,
        [id],
      );

      const row = result.rows?.[0] ?? null;
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });

      return res.json({
        submissionId: row.submission_id,
        createdAt: row.created_at,
        division: row.division,
        sex: row.sex,
        ageGroup: row.age_group,
        ageOnRaceDay: row.age_on_race_day == null ? null : Number(row.age_on_race_day),
        finishTimeSeconds: row.finish_time_seconds == null ? null : Number(row.finish_time_seconds),
        raceName: row.race_name,
        raceDate: row.race_date,
        source: row.source,
        calculatorMode: row.calculator_mode,
        roxzoneMode: row.roxzone_mode,
        splitsCount: row.splits_count == null ? null : Number(row.splits_count),
        marketingConsent: row.marketing_consent === true,
        analysisDurationMs: row.analysis_duration_ms == null ? null : Number(row.analysis_duration_ms),
        requestId: row.request_id,
        analysisScope: row.analysis_scope,
        analysisVersion: row.analysis_version,
        benchmarkGroupKey: row.benchmark_group_key,
        confidence: row.confidence,
        emailStatus: row.email_status,
        hasSharePack: row.has_share_pack === true,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  return router;
}
