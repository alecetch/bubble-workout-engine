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
  return {
    submissionId: row.submission_id ?? row.id,
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
           id AS submission_id,
           email,
           display_name,
           sex,
           age_on_race_day,
           age_group,
           division,
           finish_time_seconds,
           race_name,
           race_date,
           event_country,
           splits_json,
           penalties_json,
           race_replay_json,
           athlete_context_json,
           performance_context_json,
           marketing_consent,
           calculator_mode
         FROM hyrox_submissions
         WHERE id = $1
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
