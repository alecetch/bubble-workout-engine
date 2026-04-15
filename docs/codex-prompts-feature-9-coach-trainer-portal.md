# Codex Prompt: Feature 9 — Coach / Trainer Portal

## Context for Codex

You are implementing Feature 9 (Coach / Trainer Portal) for a Node/Express workout API.  
Stack: Node 22 ESM, Express, PostgreSQL via `pg` pool, Flyway migrations.

Key conventions:
- API is under `api/` — all files use `import`/`export` (ESM)
- Database pool is exported from `api/src/db.js` as `pool`
- Auth middleware chains live in `api/src/middleware/chains.js`:
  - `userAuth = [requireAuth]` — JWT, sets `req.auth.user_id` (UUID string)
  - `adminOnly = [requireInternalToken, requireTrustedAdminOrigin]` — internal admin operations
  - `internalApi = [requireInternalToken]` — internal token only
- `requireAuth` is exported from `api/src/middleware/requireAuth.js` and verifies a JWT, setting `req.auth.user_id`
- All routes follow the pattern: `export const xyzRouter = express.Router(); xyzRouter.METHOD(path, [...middleware], handler);`
- Routes are registered in `api/server.js`
- Migrations are Flyway versioned SQL files in `migrations/`; latest is `V65`
- Role values are stored as `TEXT` (no native PG enums); constraints are enforced via `CHECK`
- The project does **not** use native Postgres enum types

---

## Part 1: Migration V66 — `app_user.role`

Create `migrations/V66__add_role_to_app_user.sql`.

```sql
-- migrations/V66__add_role_to_app_user.sql

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'athlete';

ALTER TABLE app_user
  ADD CONSTRAINT IF NOT EXISTS chk_app_user_role
  CHECK (role IN ('athlete', 'coach', 'admin'));
```

---

## Part 2: Migration V67 — `coach_client`

Create `migrations/V67__create_coach_client.sql`.

```sql
-- migrations/V67__create_coach_client.sql

CREATE TABLE IF NOT EXISTS coach_client (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id    UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  client_user_id   UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'pending',
  invited_by_user_id UUID      NULL REFERENCES app_user(id) ON DELETE SET NULL,
  accepted_at      TIMESTAMPTZ NULL,
  revoked_at       TIMESTAMPTZ NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_coach_client_status
    CHECK (status IN ('pending', 'active', 'revoked')),
  CONSTRAINT chk_coach_client_no_self_link
    CHECK (coach_user_id <> client_user_id)
);

-- Only one active or pending relationship per coach-athlete pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_client_unique_pair_live
  ON coach_client (coach_user_id, client_user_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_coach_client_coach_status
  ON coach_client (coach_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_client_client_status
  ON coach_client (client_user_id, status, created_at DESC);
```

---

## Part 3: Migration V68 — `coach_progression_override`

Create `migrations/V68__create_coach_progression_override.sql`.

```sql
-- migrations/V68__create_coach_progression_override.sql

CREATE TABLE IF NOT EXISTS coach_progression_override (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id           UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  client_user_id          UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  program_id              UUID        NULL REFERENCES program(id) ON DELETE CASCADE,
  program_exercise_id     UUID        NULL REFERENCES program_exercise(id) ON DELETE CASCADE,
  exercise_id             TEXT        NOT NULL,
  progression_group_key   TEXT        NOT NULL,
  program_type            TEXT        NOT NULL,
  purpose                 TEXT        NOT NULL DEFAULT '',
  override_kind           TEXT        NOT NULL,
  override_payload_json   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  reason_text             TEXT        NULL,
  status                  TEXT        NOT NULL DEFAULT 'pending',
  applies_until_program_day_id UUID   NULL REFERENCES program_day(id) ON DELETE SET NULL,
  consumed_at             TIMESTAMPTZ NULL,
  revoked_at              TIMESTAMPTZ NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_cpo_override_kind
    CHECK (override_kind IN ('next_session_load', 'next_session_reps', 'next_session_hold')),
  CONSTRAINT chk_cpo_status
    CHECK (status IN ('pending', 'consumed', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_cpo_client_status
  ON coach_progression_override (client_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cpo_coach_status
  ON coach_progression_override (coach_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cpo_program_exercise
  ON coach_progression_override (program_exercise_id, status);
```

---

## Part 4: Coach middleware

Create `api/src/middleware/coachMiddleware.js`.

This file exports two middleware functions:

1. `requireCoachRole(req, res, next)` — loads the calling user's `role` from `app_user` and returns `403` if it is not `'coach'`.
2. `requireCoachClientAccess(req, res, next)` — verifies an active `coach_client` row linking `req.auth.user_id` as coach to `req.params.client_user_id` as client.

```js
// api/src/middleware/coachMiddleware.js
import { pool } from "../db.js";

export async function requireCoachRole(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT role FROM app_user WHERE id = $1`,
      [req.auth.user_id],
    );
    if (!rows.length || rows[0].role !== "coach") {
      return res.status(403).json({
        ok: false,
        code: "forbidden_not_coach",
        error: "Coach role required.",
      });
    }
    req.auth.role = rows[0].role;
    return next();
  } catch (err) {
    return next(err);
  }
}

export async function requireCoachClientAccess(req, res, next) {
  const clientUserId = req.params.client_user_id;
  if (!clientUserId) {
    return res.status(400).json({ ok: false, code: "missing_client_user_id", error: "client_user_id required." });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id FROM coach_client
       WHERE coach_user_id = $1
         AND client_user_id = $2
         AND status = 'active'
       LIMIT 1`,
      [req.auth.user_id, clientUserId],
    );
    if (!rows.length) {
      return res.status(403).json({
        ok: false,
        code: "forbidden_no_relationship",
        error: "No active coach-client relationship.",
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
```

Add the two combined chains to `api/src/middleware/chains.js`:

```js
// Add to api/src/middleware/chains.js
import { requireCoachRole, requireCoachClientAccess } from "./coachMiddleware.js";

// A coach-authenticated route (must be logged in AND have role=coach)
export const coachAuth = [requireAuth, requireCoachRole];

// A coach route scoped to a specific client (adds relationship check on top of coachAuth)
export const coachClientAuth = [requireAuth, requireCoachRole, requireCoachClientAccess];
```

---

## Part 5: Admin coach-management routes

Create `api/src/routes/adminCoaches.js`.

Provides:
- `GET /api/admin/coaches` — list all users with `role = 'coach'`, including linked athlete count
- `PATCH /api/admin/users/:user_id/role` — promote/demote a user's role
- `POST /api/admin/coaches/:coach_user_id/clients/:client_user_id/link` — create a `coach_client` relationship (status `active`)
- `DELETE /api/admin/coaches/:coach_user_id/clients/:client_user_id/link` — revoke relationship
- `GET /api/admin/coaches/:coach_user_id/activity` — list override activity for a coach

```js
// api/src/routes/adminCoaches.js
import express from "express";
import { pool } from "../db.js";
import { adminOnly } from "../middleware/chains.js";

export const adminCoachesRouter = express.Router();

// GET /api/admin/coaches
adminCoachesRouter.get("/coaches", adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.role,
        u.created_at,
        COUNT(cc.id) FILTER (WHERE cc.status = 'active') AS active_client_count
      FROM app_user u
      LEFT JOIN coach_client cc ON cc.coach_user_id = u.id
      WHERE u.role = 'coach'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    return res.json({ ok: true, coaches: rows });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/admin/users/:user_id/role
adminCoachesRouter.patch("/users/:user_id/role", adminOnly, async (req, res, next) => {
  const { user_id } = req.params;
  const { role } = req.body;
  const ALLOWED_ROLES = ["athlete", "coach", "admin"];
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ ok: false, error: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE app_user SET role = $1 WHERE id = $2 RETURNING id, email, role`,
      [role, user_id],
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "User not found." });
    return res.json({ ok: true, user: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/admin/coaches/:coach_user_id/clients/:client_user_id/link
adminCoachesRouter.post(
  "/coaches/:coach_user_id/clients/:client_user_id/link",
  adminOnly,
  async (req, res, next) => {
    const { coach_user_id, client_user_id } = req.params;
    try {
      // Verify coach role
      const coachR = await pool.query(
        `SELECT role FROM app_user WHERE id = $1`,
        [coach_user_id],
      );
      if (!coachR.rows.length || coachR.rows[0].role !== "coach") {
        return res.status(400).json({ ok: false, error: "Target user does not have coach role." });
      }
      // Create relationship
      const { rows } = await pool.query(
        `INSERT INTO coach_client (coach_user_id, client_user_id, status, accepted_at, invited_by_user_id)
         VALUES ($1, $2, 'active', now(), NULL)
         ON CONFLICT DO NOTHING
         RETURNING id, status`,
        [coach_user_id, client_user_id],
      );
      if (!rows.length) {
        return res.status(409).json({ ok: false, error: "An active or pending relationship already exists." });
      }
      return res.status(201).json({ ok: true, relationship: rows[0] });
    } catch (err) {
      return next(err);
    }
  },
);

// DELETE /api/admin/coaches/:coach_user_id/clients/:client_user_id/link
adminCoachesRouter.delete(
  "/coaches/:coach_user_id/clients/:client_user_id/link",
  adminOnly,
  async (req, res, next) => {
    const { coach_user_id, client_user_id } = req.params;
    try {
      const { rows } = await pool.query(
        `UPDATE coach_client
         SET status = 'revoked', revoked_at = now(), updated_at = now()
         WHERE coach_user_id = $1
           AND client_user_id = $2
           AND status IN ('active', 'pending')
         RETURNING id`,
        [coach_user_id, client_user_id],
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "No active relationship found to revoke." });
      }
      return res.json({ ok: true, revoked: rows[0].id });
    } catch (err) {
      return next(err);
    }
  },
);

// GET /api/admin/coaches/:coach_user_id/activity
adminCoachesRouter.get(
  "/coaches/:coach_user_id/activity",
  adminOnly,
  async (req, res, next) => {
    const { coach_user_id } = req.params;
    try {
      const { rows } = await pool.query(
        `SELECT cpo.id, cpo.client_user_id, cpo.exercise_id, cpo.override_kind,
                cpo.status, cpo.reason_text, cpo.created_at, cpo.consumed_at
         FROM coach_progression_override cpo
         WHERE cpo.coach_user_id = $1
         ORDER BY cpo.created_at DESC
         LIMIT 100`,
        [coach_user_id],
      );
      return res.json({ ok: true, overrides: rows });
    } catch (err) {
      return next(err);
    }
  },
);
```

---

## Part 6: Coach portal routes

Create `api/src/routes/coachPortal.js`.

This module exports `coachPortalRouter` and implements all coach-scoped routes. All routes require `coachAuth` or `coachClientAuth` from `chains.js`.

```js
// api/src/routes/coachPortal.js
import express from "express";
import { pool } from "../db.js";
import { coachAuth, coachClientAuth } from "../middleware/chains.js";

export const coachPortalRouter = express.Router();

// ─── GET /api/coach/clients ───────────────────────────────────────────────────
// Return all active clients for the authenticated coach with dashboard summary.
coachPortalRouter.get("/clients", coachAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        cc.id                             AS relationship_id,
        u.id                              AS client_user_id,
        cp.id                             AS client_profile_id,
        COALESCE(cp.name, u.email)        AS display_name,
        -- active program
        p.id                              AS program_id,
        p.program_title,
        p.program_type,
        p.status                          AS program_status,
        -- last session
        (
          SELECT pd2.scheduled_date
          FROM program_day pd2
          JOIN program p2 ON p2.id = pd2.program_id
          WHERE p2.user_id = u.id
            AND pd2.is_completed = TRUE
          ORDER BY pd2.scheduled_date DESC
          LIMIT 1
        ) AS last_session_date,
        -- streak (count consecutive completed days ending today)
        (
          SELECT COUNT(*)
          FROM (
            SELECT pd3.scheduled_date,
                   ROW_NUMBER() OVER (ORDER BY pd3.scheduled_date DESC) AS rn
            FROM program_day pd3
            JOIN program p3 ON p3.id = pd3.program_id
            WHERE p3.user_id = u.id
              AND pd3.is_completed = TRUE
          ) sub
          WHERE (CURRENT_DATE - sub.scheduled_date) = sub.rn - 1
        ) AS current_streak,
        -- pending override flag
        EXISTS (
          SELECT 1 FROM coach_progression_override cpo
          WHERE cpo.client_user_id = u.id
            AND cpo.coach_user_id = $1
            AND cpo.status = 'pending'
        ) AS has_active_override,
        cc.status                         AS relationship_status
      FROM coach_client cc
      JOIN app_user u    ON u.id = cc.client_user_id
      LEFT JOIN client_profile cp ON cp.user_id = u.id
      LEFT JOIN program p ON p.user_id = u.id AND p.status = 'active' AND p.is_ready = TRUE
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
});

// ─── GET /api/coach/clients/:client_user_id/overview ─────────────────────────
coachPortalRouter.get(
  "/clients/:client_user_id/overview",
  coachClientAuth,
  async (req, res, next) => {
    const { client_user_id } = req.params;
    try {
      // Client profile
      const profileR = await pool.query(
        `SELECT u.id AS client_user_id,
                COALESCE(cp.name, u.email) AS display_name,
                cp.fitness_level AS fitness_level_slug,
                cp.goals
         FROM app_user u
         LEFT JOIN client_profile cp ON cp.user_id = u.id
         WHERE u.id = $1`,
        [client_user_id],
      );
      if (!profileR.rows.length) {
        return res.status(404).json({ ok: false, error: "Client not found." });
      }

      // Active program
      const programR = await pool.query(
        `SELECT p.id AS program_id, p.program_title, p.program_type,
                p.weeks_count, p.days_per_week, p.status
         FROM program p
         WHERE p.user_id = $1
           AND p.status = 'active'
           AND p.is_ready = TRUE
         ORDER BY p.created_at DESC
         LIMIT 1`,
        [client_user_id],
      );

      // Summary stats
      const summaryR = await pool.query(
        `SELECT
           MAX(pd.scheduled_date)  AS last_session_date,
           COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE) AS completed_sessions,
           COUNT(pd.id)            AS total_sessions
         FROM program_day pd
         JOIN program p ON p.id = pd.program_id
         WHERE p.user_id = $1`,
        [client_user_id],
      );

      const s = summaryR.rows[0];
      const total = Number(s.total_sessions) || 0;
      const completed = Number(s.completed_sessions) || 0;

      return res.json({
        ok: true,
        client: profileR.rows[0],
        active_program: programR.rows[0] ?? null,
        summary: {
          last_session_date: s.last_session_date ?? null,
          current_streak: 0, // simplified — full streak logic can be added
          completion_ratio: total > 0 ? +(completed / total).toFixed(2) : 0,
        },
      });
    } catch (err) {
      return next(err);
    }
  },
);

// ─── GET /api/coach/clients/:client_user_id/programs ─────────────────────────
coachPortalRouter.get(
  "/clients/:client_user_id/programs",
  coachClientAuth,
  async (req, res, next) => {
    const { client_user_id } = req.params;
    try {
      const { rows } = await pool.query(
        `SELECT
           p.id AS program_id,
           p.program_title,
           p.program_summary,
           p.program_type,
           p.start_date,
           p.status,
           p.is_ready,
           COUNT(pd.id) AS total_sessions,
           COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE) AS completed_sessions
         FROM program p
         LEFT JOIN program_day pd ON pd.program_id = p.id
         WHERE p.user_id = $1
           AND p.is_ready = TRUE
         GROUP BY p.id
         ORDER BY p.start_date DESC, p.created_at DESC
         LIMIT 50`,
        [client_user_id],
      );
      const programs = rows.map((r) => {
        const total = Number(r.total_sessions) || 0;
        const done = Number(r.completed_sessions) || 0;
        return {
          ...r,
          is_active: r.status === "active",
          completion_ratio: total > 0 ? +(done / total).toFixed(2) : 0,
        };
      });
      return res.json({ ok: true, programs });
    } catch (err) {
      return next(err);
    }
  },
);

// ─── GET /api/coach/clients/:client_user_id/decisions ────────────────────────
// Cross-exercise progression decision feed for a client.
// Query params: program_id, exercise_id, limit (default 50), offset (default 0)
coachPortalRouter.get(
  "/clients/:client_user_id/decisions",
  coachClientAuth,
  async (req, res, next) => {
    const { client_user_id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset ?? "0", 10) || 0, 0);
    const programId = req.query.program_id ?? null;
    const exerciseId = req.query.exercise_id ?? null;

    try {
      const conditions = [`p.user_id = $1`];
      const params = [client_user_id];
      let idx = 2;

      if (programId) {
        conditions.push(`epd.program_id = $${idx++}`);
        params.push(programId);
      }
      if (exerciseId) {
        conditions.push(`epd.exercise_id = $${idx++}`);
        params.push(exerciseId);
      }

      params.push(limit, offset);
      const limitIdx = idx++;
      const offsetIdx = idx++;

      const { rows } = await pool.query(
        `
        SELECT
          epd.id,
          pe.id                       AS program_exercise_id,
          epd.exercise_id,
          epd.exercise_name,
          p.program_title,
          epd.week_number,
          epd.day_number,
          epd.decision_outcome        AS outcome,
          epd.confidence,
          epd.display_label,
          epd.display_reason,
          epd.decided_at
        FROM exercise_progression_decision epd
        JOIN program p ON p.id = epd.program_id
        LEFT JOIN program_exercise pe
          ON pe.program_id = epd.program_id
          AND pe.exercise_id = epd.exercise_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY epd.decided_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        params,
      );
      return res.json({ ok: true, rows });
    } catch (err) {
      return next(err);
    }
  },
);

// ─── GET /api/coach/clients/:client_user_id/recent-sessions ──────────────────
coachPortalRouter.get(
  "/clients/:client_user_id/recent-sessions",
  coachClientAuth,
  async (req, res, next) => {
    const { client_user_id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? "20", 10) || 20, 1), 50);
    try {
      const { rows } = await pool.query(
        `SELECT
           pd.id,
           pd.program_id,
           p.program_title,
           pd.scheduled_date,
           pd.week_number,
           pd.day_number,
           pd.is_completed,
           pd.session_duration_mins,
           pd.completed_at
         FROM program_day pd
         JOIN program p ON p.id = pd.program_id
         WHERE p.user_id = $1
           AND pd.is_completed = TRUE
         ORDER BY pd.scheduled_date DESC
         LIMIT $2`,
        [client_user_id, limit],
      );
      return res.json({ ok: true, sessions: rows });
    } catch (err) {
      return next(err);
    }
  },
);

// ─── POST /api/coach/clients/:client_user_id/progression-override ─────────────
coachPortalRouter.post(
  "/clients/:client_user_id/progression-override",
  coachClientAuth,
  async (req, res, next) => {
    const { client_user_id } = req.params;
    const { program_exercise_id, override_kind, override_payload, reason_text } = req.body;

    const ALLOWED_KINDS = ["next_session_load", "next_session_reps", "next_session_hold"];
    if (!ALLOWED_KINDS.includes(override_kind)) {
      return res.status(400).json({
        ok: false,
        error: `override_kind must be one of: ${ALLOWED_KINDS.join(", ")}`,
      });
    }
    if (!program_exercise_id) {
      return res.status(400).json({ ok: false, error: "program_exercise_id is required." });
    }
    if (!override_payload || typeof override_payload !== "object") {
      return res.status(400).json({ ok: false, error: "override_payload must be an object." });
    }

    try {
      // Verify the program_exercise belongs to the client and its program is active
      const peR = await pool.query(
        `SELECT pe.id, pe.exercise_id, pe.progression_group_key, pe.purpose,
                p.program_type, p.id AS program_id
         FROM program_exercise pe
         JOIN program p ON p.id = pe.program_id
         WHERE pe.id = $1
           AND p.user_id = $2
           AND p.status = 'active'`,
        [program_exercise_id, client_user_id],
      );
      if (!peR.rows.length) {
        return res.status(403).json({
          ok: false,
          error: "program_exercise_id not found or does not belong to an active client program.",
        });
      }

      const pe = peR.rows[0];

      const { rows } = await pool.query(
        `INSERT INTO coach_progression_override (
           coach_user_id, client_user_id, program_id, program_exercise_id,
           exercise_id, progression_group_key, program_type, purpose,
           override_kind, override_payload_json, reason_text, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
         RETURNING id, status`,
        [
          req.auth.user_id,
          client_user_id,
          pe.program_id,
          program_exercise_id,
          pe.exercise_id,
          pe.progression_group_key ?? "",
          pe.program_type,
          pe.purpose ?? "",
          override_kind,
          JSON.stringify(override_payload),
          reason_text ?? null,
        ],
      );
      return res.status(201).json({ ok: true, override_id: rows[0].id, status: rows[0].status });
    } catch (err) {
      return next(err);
    }
  },
);

// ─── GET /api/coach/clients/:client_user_id/progression-overrides ─────────────
coachPortalRouter.get(
  "/clients/:client_user_id/progression-overrides",
  coachClientAuth,
  async (req, res, next) => {
    const { client_user_id } = req.params;
    try {
      const { rows } = await pool.query(
        `SELECT id, exercise_id, override_kind, override_payload_json,
                reason_text, status, consumed_at, revoked_at, created_at
         FROM coach_progression_override
         WHERE coach_user_id = $1
           AND client_user_id = $2
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.auth.user_id, client_user_id],
      );
      return res.json({ ok: true, overrides: rows });
    } catch (err) {
      return next(err);
    }
  },
);

// ─── POST /api/coach/relationships/:relationship_id/revoke ────────────────────
coachPortalRouter.post(
  "/relationships/:relationship_id/revoke",
  coachAuth,
  async (req, res, next) => {
    const { relationship_id } = req.params;
    try {
      const { rows } = await pool.query(
        `UPDATE coach_client
         SET status = 'revoked', revoked_at = now(), updated_at = now()
         WHERE id = $1
           AND coach_user_id = $2
           AND status IN ('active', 'pending')
         RETURNING id`,
        [relationship_id, req.auth.user_id],
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "Relationship not found or already revoked." });
      }
      return res.json({ ok: true, revoked: rows[0].id });
    } catch (err) {
      return next(err);
    }
  },
);
```

---

## Part 7: Register routes in `api/server.js`

In `api/server.js`, import both new routers and mount them:

```js
// Add with other route imports:
import { coachPortalRouter } from "./src/routes/coachPortal.js";
import { adminCoachesRouter } from "./src/routes/adminCoaches.js";

// Mount (add alongside other app.use calls, order matters — specific before wildcard):
app.use("/api/coach", coachPortalRouter);
app.use("/api/admin", adminCoachesRouter);
```

---

## Part 8: Tests

Create `api/src/routes/__tests__/coachPortal.route.test.js`.

Cover the following cases:

### Role / relationship authorization

- `GET /api/coach/clients` with a non-coach JWT returns `403` with `code: "forbidden_not_coach"`
- `GET /api/coach/clients/:client_user_id/overview` with coach who has no relationship returns `403` with `code: "forbidden_no_relationship"`
- `GET /api/coach/clients/:client_user_id/overview` with coach whose relationship is `revoked` returns `403`
- `GET /api/coach/clients/:client_user_id/overview` with valid active relationship returns `200`

### Coach client list

- `GET /api/coach/clients` returns only the coach's active linked athletes
- Response includes `display_name`, `program_id` (or null if no active program), `relationship_status`

### Client overview

- `GET /api/coach/clients/:id/overview` returns `client`, `active_program`, `summary` fields

### Decisions feed

- `GET /api/coach/clients/:id/decisions` returns results newest first
- `?limit=5` caps results at 5
- `?program_id=...` filters to that program

### Override creation

- `POST .../progression-override` with `override_kind = "next_session_load"` and valid `override_payload` returns `201` with `override_id`
- `POST .../progression-override` with invalid `override_kind` returns `400`
- `POST .../progression-override` when `program_exercise_id` belongs to a different user returns `403`
- `POST .../progression-override` when coach has no active relationship returns `403`

### Admin routes

- `GET /api/admin/coaches` returns users with `role = 'coach'`
- `PATCH /api/admin/users/:id/role` with `role: "coach"` promotes the user
- `PATCH /api/admin/users/:id/role` with invalid role returns `400`
- `POST /api/admin/coaches/.../link` creates an active relationship
- `POST /api/admin/coaches/.../link` when relationship already exists returns `409`
- `DELETE /api/admin/coaches/.../link` revokes active relationship
- `DELETE /api/admin/coaches/.../link` when no active relationship returns `404`

---

## Implementation notes

- The `coachAuth` and `coachClientAuth` chains are defined in `chains.js` and depend on `requireCoachRole` / `requireCoachClientAccess` from `coachMiddleware.js`. Import these properly.
- All SQL in `coachPortal.js` queries athlete data scoped to `client_user_id` — never `req.auth.user_id` — after the relationship check passes.
- `exercise_progression_decision` column names (`decision_outcome`, `confidence`, `display_label`, `display_reason`, `decided_at`) — verify against the actual schema in `migrations/V60__create_exercise_progression_decision.sql` before finalizing the decisions query. Adjust column aliases accordingly.
- The `client_profile` table column for display name should be confirmed. If `name` does not exist, fall back to `u.email` only (remove `COALESCE` branch referencing `cp.name`).
- Do not integrate coach overrides into the pipeline's prescription resolution in this slice. Override consumption (making pending overrides affect prescription at day-read time) is the next phase and is out of scope here.
