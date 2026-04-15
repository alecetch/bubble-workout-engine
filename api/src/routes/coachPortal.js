import express from "express";
import { pool } from "../db.js";
import { coachAuth, coachClientAuth } from "../middleware/chains.js";
import { requireEnum, requireUuid, safeString } from "../utils/validate.js";

const OUTCOME_DETAIL_FALLBACK = {
  increase_load: "Your recent sessions hit the rep target comfortably - load has been increased.",
  increase_reps: "You are ready to push further into the rep range before the next load jump.",
  increase_sets: "Volume is increasing this session.",
  reduce_rest: "Rest periods are tightening as conditioning improves.",
  hold: "The current prescription stays the same - more data needed before changing.",
  deload_local: "Recent sessions showed signs of fatigue or underperformance - load is reduced to recover.",
};

const DECISION_HISTORY_LABEL_PHRASE = {
  increase_load: (delta) => (delta != null ? `Added ${Math.abs(delta)} kg` : "Load increased"),
  increase_reps: () => "Rep target increased",
  increase_sets: () => "Set added",
  reduce_rest: () => "Rest reduced",
  hold: () => "Held steady",
  deload_local: () => "Load reduced (deload)",
};

const ALLOWED_OVERRIDE_KINDS = ["next_session_load", "next_session_reps", "next_session_hold"];

function normalizeDecisionSentence(value) {
  const trimmed = safeString(value);
  if (!trimmed) return null;
  let sentence = trimmed;
  if (!sentence.endsWith(".")) sentence += ".";
  if (sentence.length > 160) {
    sentence = `${sentence.slice(0, 157).replace(/\s+\S*$/, "")}...`;
  }
  return sentence;
}

function extractDecisionReasons(decisionContext) {
  try {
    const ctx = typeof decisionContext === "object" && decisionContext !== null
      ? decisionContext
      : JSON.parse(String(decisionContext ?? "{}"));
    return Array.isArray(ctx.reasons) ? ctx.reasons : [];
  } catch {
    return [];
  }
}

function buildCoachDecisionItem(row) {
  const outcome = safeString(row.decision_outcome) || "hold";
  const delta = row.recommended_load_delta_kg != null ? Number(row.recommended_load_delta_kg) : null;
  const phraseBuilder = DECISION_HISTORY_LABEL_PHRASE[outcome] ?? (() => outcome);
  const reasons = extractDecisionReasons(row.decision_context_json);

  return {
    id: row.id,
    program_exercise_id: row.program_exercise_id,
    exercise_id: row.exercise_id,
    exercise_name: safeString(row.exercise_name) || row.exercise_id,
    program_id: row.program_id,
    program_title: row.program_title,
    week_number: row.week_number ?? null,
    day_number: row.day_number ?? null,
    outcome,
    confidence: safeString(row.confidence) || null,
    display_label: row.week_number != null
      ? `Week ${row.week_number} - ${phraseBuilder(delta)}`
      : phraseBuilder(delta),
    display_reason: normalizeDecisionSentence(reasons[0]) ?? OUTCOME_DETAIL_FALLBACK[outcome] ?? null,
    decided_at: row.decided_at,
  };
}

export function createCoachPortalHandlers(db = pool) {
  async function listClients(req, res, next) {
    try {
      const { rows } = await db.query(
        `
        SELECT
          cc.id AS relationship_id,
          u.id AS client_user_id,
          cp.id AS client_profile_id,
          COALESCE(NULLIF(cp.display_name, ''), u.email, u.id::text) AS display_name,
          p.id AS program_id,
          p.program_title,
          p.program_type,
          p.status AS program_status,
          (
            SELECT MAX(pd2.scheduled_date)
            FROM program_day pd2
            JOIN program p2 ON p2.id = pd2.program_id
            WHERE p2.user_id = u.id
              AND pd2.is_completed = TRUE
          ) AS last_session_date,
          EXISTS (
            SELECT 1
            FROM coach_progression_override cpo
            WHERE cpo.client_user_id = u.id
              AND cpo.coach_user_id = $1
              AND cpo.status = 'pending'
          ) AS has_active_override,
          cc.status AS relationship_status
        FROM coach_client cc
        JOIN app_user u
          ON u.id = cc.client_user_id
        LEFT JOIN client_profile cp
          ON cp.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT p1.id, p1.program_title, p1.program_type, p1.status
          FROM program p1
          WHERE p1.user_id = u.id
            AND p1.status = 'active'
            AND p1.is_ready = TRUE
          ORDER BY p1.is_primary DESC, p1.created_at DESC
          LIMIT 1
        ) p ON TRUE
        WHERE cc.coach_user_id = $1
          AND cc.status = 'active'
        ORDER BY cc.created_at DESC
        `,
        [req.auth.user_id],
      );

      return res.json({ ok: true, clients: rows });
    } catch (err) {
      return next(err);
    }
  }

  async function clientOverview(req, res, next) {
    try {
      const clientUserId = requireUuid(req.params.client_user_id, "client_user_id");

      const [profileR, programR, summaryR] = await Promise.all([
        db.query(
          `SELECT
             u.id AS client_user_id,
             COALESCE(NULLIF(cp.display_name, ''), u.email, u.id::text) AS display_name,
             cp.fitness_level_slug,
             cp.main_goals_slugs
           FROM app_user u
           LEFT JOIN client_profile cp
             ON cp.user_id = u.id
           WHERE u.id = $1
           LIMIT 1`,
          [clientUserId],
        ),
        db.query(
          `SELECT
             p.id AS program_id,
             p.program_title,
             p.program_type,
             p.weeks_count,
             p.days_per_week,
             p.status
           FROM program p
           WHERE p.user_id = $1
             AND p.status = 'active'
             AND p.is_ready = TRUE
           ORDER BY p.is_primary DESC, p.created_at DESC
           LIMIT 1`,
          [clientUserId],
        ),
        db.query(
          `SELECT
             MAX(pd.scheduled_date) AS last_session_date,
             COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE)::int AS completed_sessions,
             COUNT(pd.id)::int AS total_sessions
           FROM program_day pd
           JOIN program p
             ON p.id = pd.program_id
           WHERE p.user_id = $1
             AND p.is_ready = TRUE`,
          [clientUserId],
        ),
      ]);

      if (!profileR.rows.length) {
        return res.status(404).json({ ok: false, error: "Client not found." });
      }

      const summary = summaryR.rows[0] ?? {};
      const completed = Number(summary.completed_sessions ?? 0);
      const total = Number(summary.total_sessions ?? 0);

      return res.json({
        ok: true,
        client: {
          ...profileR.rows[0],
          goals: profileR.rows[0].main_goals_slugs ?? [],
        },
        active_program: programR.rows[0] ?? null,
        summary: {
          last_session_date: summary.last_session_date ?? null,
          current_streak: 0,
          completion_ratio: total > 0 ? +(completed / total).toFixed(2) : 0,
        },
      });
    } catch (err) {
      return next(err);
    }
  }

  async function clientPrograms(req, res, next) {
    try {
      const clientUserId = requireUuid(req.params.client_user_id, "client_user_id");
      const { rows } = await db.query(
        `SELECT
           p.id AS program_id,
           p.program_title,
           p.program_summary,
           p.program_type,
           p.start_date,
           p.status,
           p.is_ready,
           COUNT(pd.id)::int AS total_sessions,
           COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE)::int AS completed_sessions
         FROM program p
         LEFT JOIN program_day pd
           ON pd.program_id = p.id
         WHERE p.user_id = $1
           AND p.is_ready = TRUE
         GROUP BY p.id
         ORDER BY p.start_date DESC NULLS LAST, p.created_at DESC
         LIMIT 50`,
        [clientUserId],
      );

      const programs = rows.map((row) => {
        const total = Number(row.total_sessions ?? 0);
        const completed = Number(row.completed_sessions ?? 0);
        return {
          ...row,
          is_active: row.status === "active",
          completion_ratio: total > 0 ? +(completed / total).toFixed(2) : 0,
        };
      });

      return res.json({ ok: true, programs });
    } catch (err) {
      return next(err);
    }
  }

  async function clientDecisions(req, res, next) {
    try {
      const clientUserId = requireUuid(req.params.client_user_id, "client_user_id");
      const limit = Math.min(Math.max(parseInt(req.query.limit ?? "50", 10) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset ?? "0", 10) || 0, 0);
      const programId = safeString(req.query.program_id) || null;
      const exerciseId = safeString(req.query.exercise_id) || null;

      const conditions = ["p.user_id = $1"];
      const params = [clientUserId];
      let idx = 2;

      if (programId) {
        conditions.push(`epd.program_id = $${idx}`);
        params.push(programId);
        idx += 1;
      }

      if (exerciseId) {
        conditions.push(`epd.exercise_id = $${idx}`);
        params.push(exerciseId);
        idx += 1;
      }

      params.push(limit, offset);
      const limitIdx = idx;
      const offsetIdx = idx + 1;

      const { rows } = await db.query(
        `
        SELECT
          epd.id,
          epd.program_id,
          epd.program_exercise_id,
          epd.exercise_id,
          COALESCE(
            NULLIF(pe.exercise_name, ''),
            NULLIF(ec.name, ''),
            epd.exercise_id
          ) AS exercise_name,
          p.program_title,
          pd.week_number,
          pd.day_number,
          epd.decision_outcome,
          epd.confidence,
          epd.recommended_load_delta_kg,
          epd.decision_context_json,
          epd.created_at AS decided_at
        FROM exercise_progression_decision epd
        JOIN program p
          ON p.id = epd.program_id
        LEFT JOIN program_day pd
          ON pd.id = epd.program_day_id
        LEFT JOIN program_exercise pe
          ON pe.id = epd.program_exercise_id
        LEFT JOIN exercise_catalogue ec
          ON ec.exercise_id = epd.exercise_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY epd.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        params,
      );

      return res.json({ ok: true, rows: rows.map(buildCoachDecisionItem) });
    } catch (err) {
      return next(err);
    }
  }

  async function recentSessions(req, res, next) {
    try {
      const clientUserId = requireUuid(req.params.client_user_id, "client_user_id");
      const limit = Math.min(Math.max(parseInt(req.query.limit ?? "20", 10) || 20, 1), 50);

      const { rows } = await db.query(
        `SELECT
           pd.id,
           pd.program_id,
           p.program_title,
           pd.scheduled_date,
           pd.week_number,
           pd.day_number,
           pd.is_completed,
           pd.session_duration_mins
         FROM program_day pd
         JOIN program p
           ON p.id = pd.program_id
         WHERE p.user_id = $1
           AND pd.is_completed = TRUE
         ORDER BY pd.scheduled_date DESC, pd.global_day_index DESC
         LIMIT $2`,
        [clientUserId, limit],
      );

      return res.json({ ok: true, sessions: rows });
    } catch (err) {
      return next(err);
    }
  }

  async function createProgressionOverride(req, res, next) {
    try {
      const clientUserId = requireUuid(req.params.client_user_id, "client_user_id");
      const programExerciseId = requireUuid(req.body?.program_exercise_id, "program_exercise_id");
      const overrideKind = requireEnum(req.body?.override_kind, "override_kind", ALLOWED_OVERRIDE_KINDS);
      const overridePayload = req.body?.override_payload;
      const reasonText = safeString(req.body?.reason_text, { maxLength: 1000 }) || null;

      if (!overridePayload || typeof overridePayload !== "object" || Array.isArray(overridePayload)) {
        return res.status(400).json({ ok: false, error: "override_payload must be an object." });
      }

      const peR = await db.query(
        `SELECT
           pe.id,
           pe.exercise_id,
           pe.purpose,
           p.id AS program_id,
           p.program_type
         FROM program_exercise pe
         JOIN program p
           ON p.id = pe.program_id
         WHERE pe.id = $1
           AND p.user_id = $2
           AND p.status = 'active'`,
        [programExerciseId, clientUserId],
      );

      if (!peR.rows.length) {
        return res.status(403).json({
          ok: false,
          error: "program_exercise_id not found or does not belong to an active client program.",
        });
      }

      const pe = peR.rows[0];
      const { rows } = await db.query(
        `INSERT INTO coach_progression_override (
           coach_user_id,
           client_user_id,
           program_id,
           program_exercise_id,
           exercise_id,
           progression_group_key,
           program_type,
           purpose,
           override_kind,
           override_payload_json,
           reason_text,
           status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, 'pending')
         RETURNING id, status`,
        [
          req.auth.user_id,
          clientUserId,
          pe.program_id,
          programExerciseId,
          pe.exercise_id,
          `exercise:${pe.exercise_id}`,
          pe.program_type,
          pe.purpose ?? "",
          overrideKind,
          JSON.stringify(overridePayload),
          reasonText,
        ],
      );

      return res.status(201).json({ ok: true, override_id: rows[0].id, status: rows[0].status });
    } catch (err) {
      if (err?.name === "RequestValidationError" && safeString(err.message).includes("override_kind")) {
        return res.status(400).json({
          ok: false,
          error: `override_kind must be one of: ${ALLOWED_OVERRIDE_KINDS.join(", ")}`,
        });
      }
      return next(err);
    }
  }

  async function progressionOverrides(req, res, next) {
    try {
      const clientUserId = requireUuid(req.params.client_user_id, "client_user_id");

      const { rows } = await db.query(
        `SELECT
           id,
           exercise_id,
           override_kind,
           override_payload_json,
           reason_text,
           status,
           consumed_at,
           revoked_at,
           created_at
         FROM coach_progression_override
         WHERE coach_user_id = $1
           AND client_user_id = $2
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.auth.user_id, clientUserId],
      );

      return res.json({ ok: true, overrides: rows });
    } catch (err) {
      return next(err);
    }
  }

  async function revokeRelationship(req, res, next) {
    try {
      const relationshipId = requireUuid(req.params.relationship_id, "relationship_id");

      const { rows } = await db.query(
        `UPDATE coach_client
         SET status = 'revoked',
             revoked_at = now(),
             updated_at = now()
         WHERE id = $1
           AND coach_user_id = $2
           AND status IN ('active', 'pending')
         RETURNING id`,
        [relationshipId, req.auth.user_id],
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "Relationship not found or already revoked." });
      }

      return res.json({ ok: true, revoked: rows[0].id });
    } catch (err) {
      return next(err);
    }
  }

  return {
    listClients,
    clientOverview,
    clientPrograms,
    clientDecisions,
    recentSessions,
    createProgressionOverride,
    progressionOverrides,
    revokeRelationship,
  };
}

export const coachPortalRouter = express.Router();
const handlers = createCoachPortalHandlers();

coachPortalRouter.get("/clients", coachAuth, handlers.listClients);
coachPortalRouter.get("/clients/:client_user_id/overview", coachClientAuth, handlers.clientOverview);
coachPortalRouter.get("/clients/:client_user_id/programs", coachClientAuth, handlers.clientPrograms);
coachPortalRouter.get("/clients/:client_user_id/decisions", coachClientAuth, handlers.clientDecisions);
coachPortalRouter.get("/clients/:client_user_id/recent-sessions", coachClientAuth, handlers.recentSessions);
coachPortalRouter.post(
  "/clients/:client_user_id/progression-override",
  coachClientAuth,
  handlers.createProgressionOverride,
);
coachPortalRouter.get(
  "/clients/:client_user_id/progression-overrides",
  coachClientAuth,
  handlers.progressionOverrides,
);
coachPortalRouter.post(
  "/relationships/:relationship_id/revoke",
  coachAuth,
  handlers.revokeRelationship,
);
