import { pool } from "../db.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function dateString(value) {
  if (!value) return undefined;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return undefined;
}

export function draftFromSubmissionRow(row = {}) {
  const athleteContext = objectOrEmpty(row.athlete_context_json);
  const performanceContext = objectOrEmpty(row.performance_context_json);
  const biggestLimiter = row.analysis_json?.headline?.biggestLimiter ?? null;
  return {
    submissionId: row.submission_id ?? row.id,
    analysisSummary: biggestLimiter
      ? {
          limiterLabel: biggestLimiter.label ?? null,
          limiterSegmentKey: biggestLimiter.segmentKey ?? null,
          potentialGainSeconds: Number.isFinite(row.analysis_json?.headline?.headlineGainSeconds)
            ? row.analysis_json.headline.headlineGainSeconds
            : null,
        }
      : null,
    draft: {
      calculatorMode: row.calculator_mode === "analyse" ? "analyse" : "target",
      athlete: {
        name: row.display_name ?? undefined,
        email: row.email ?? undefined,
        gender: row.sex ?? "male",
        ageOnRaceDay: row.age_on_race_day ?? undefined,
        ageGroup: row.age_group ?? undefined,
      },
      race: {
        raceName: row.race_name ?? undefined,
        raceDate: dateString(row.race_date),
        eventCountry: row.event_country ?? undefined,
        division: row.division ?? "open",
        finishTimeSeconds: row.finish_time_seconds,
      },
      splits: arrayOrEmpty(row.splits_json),
      penalties: arrayOrEmpty(row.penalties_json),
      raceReplay: arrayOrEmpty(row.race_replay_json),
      roxzoneTimeSeconds: row.roxzone_time_seconds ?? athleteContext.roxzoneTimeSeconds ?? undefined,
      athleteContext: {
        trainingAge: athleteContext.trainingAge,
        primaryBackground: athleteContext.primaryBackground,
        weeklyRunningVolume: athleteContext.weeklyRunningVolume,
        weeklyStrengthSessions: athleteContext.weeklyStrengthSessions,
        targetFinishTimeSeconds: athleteContext.targetFinishTimeSeconds,
        additionalContext: athleteContext.additionalContext,
      },
      performanceContext,
      marketingConsent: row.marketing_consent === true,
    },
  };
}

export function createHyroxSubmissionDraftHandler(db = pool) {
  return async function hyroxSubmissionDraft(req, res) {
    const submissionId = String(req.params.submissionId ?? "").trim();
    if (!UUID_RE.test(submissionId)) {
      return res.status(400).json({ error: "invalid_submission_id" });
    }

    try {
      const result = await db.query(
        `SELECT
           s.id AS submission_id,
           s.email,
           s.display_name,
           s.sex,
           s.age_on_race_day,
           s.age_group,
           s.division,
           s.finish_time_seconds,
           s.race_name,
           s.race_date,
           s.event_country,
           s.splits_json,
           s.penalties_json,
           s.race_replay_json,
           s.athlete_context_json,
           s.performance_context_json,
           s.marketing_consent,
           s.calculator_mode,
           a.analysis_json
         FROM hyrox_submissions s
         LEFT JOIN hyrox_analyses a ON a.submission_id = s.id
         WHERE s.id = $1
         LIMIT 1`,
        [submissionId],
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: "not_found" });
      return res.status(200).json(draftFromSubmissionRow(row));
    } catch (err) {
      req.log?.error?.({ event: "hyrox.submission_draft_failed", err: err?.message }, "HYROX submission draft restore failed");
      return res.status(500).json({ error: "restore_failed" });
    }
  };
}
