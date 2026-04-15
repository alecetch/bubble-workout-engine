# Codex Prompt: Feature 8 — Multi-Program / Concurrent Training

## Context for Codex

You are implementing Feature 8 (Multi-Program / Concurrent Training) for a Node/Express workout API.  
Stack: Node 22 ESM, Express, PostgreSQL via `pg` pool, Flyway migrations, React Native / Expo mobile app.

Key conventions:
- API is under `api/` — all files use `import`/`export` (ESM)
- Database pool is exported from `api/src/db.js` as `pool`
- Auth middleware chains live in `api/src/middleware/chains.js`:
  - `userAuth = [requireAuth]` — JWT, sets `req.auth.user_id` (UUID string)
  - `internalApi = [requireInternalToken]` — internal token header
- All routes follow the pattern: `export const xyzRouter = express.Router(); xyzRouter.METHOD(path, [...middleware], handler);`
- Routes are registered in `api/server.js`
- Migrations are Flyway versioned SQL files in `migrations/`; latest is `V65`
- `program_calendar_day` currently has `UNIQUE (program_id, scheduled_date)` and no `user_id` column
- `program` table has `user_id`, `status` (values: `'generating'`, `'active'`, `'completed'`, `'archived'`), `program_type`, `is_ready`, but NO `is_primary` yet
- `ensureProgramCalendarCoverage(pool, programId)` in `api/src/services/calendarCoverage.js` fills recovery rows; it uses `ON CONFLICT (program_id, scheduled_date) DO NOTHING`
- In `generateProgramV2.js`, the Phase 2 INSERT creates the program row (status=`'generating'`), Phase 5b calls `ensureCalendar(db, created_program_id)`, Phase 5 UPDATE sets status=`'active'`

---

## Part 1: Migration V66 — `program.is_primary`

Create `migrations/V66__add_is_primary_to_program.sql`.

```sql
-- migrations/V66__add_is_primary_to_program.sql

-- Step 1: add column
ALTER TABLE program
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: backfill — for each user, pick the newest active program as primary
UPDATE program p
SET is_primary = TRUE
FROM (
  SELECT DISTINCT ON (user_id) id
  FROM program
  WHERE status = 'active'
    AND is_ready = TRUE
  ORDER BY user_id, created_at DESC
) ranked
WHERE p.id = ranked.id;

-- Step 3: partial unique indexes
-- Only one primary active program per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_program_one_primary_active_per_user
  ON program (user_id)
  WHERE status = 'active' AND is_primary = TRUE;

-- Only one active program per program_type per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_program_one_active_per_type_per_user
  ON program (user_id, program_type)
  WHERE status = 'active';
```

---

## Part 2: Migration V67 — `program_calendar_day.user_id`

Create `migrations/V67__add_user_id_to_program_calendar_day.sql`.

```sql
-- migrations/V67__add_user_id_to_program_calendar_day.sql

-- Step 1: add nullable column
ALTER TABLE program_calendar_day
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id) ON DELETE CASCADE;

-- Step 2: backfill from program.user_id
UPDATE program_calendar_day pcd
SET user_id = p.user_id
FROM program p
WHERE pcd.program_id = p.id
  AND pcd.user_id IS NULL;

-- Step 3: make NOT NULL
ALTER TABLE program_calendar_day
  ALTER COLUMN user_id SET NOT NULL;

-- Step 4: partial unique index — no two training days on same user/date
-- (recovery rows have is_training_day=false and are excluded)
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_user_training_date
  ON program_calendar_day (user_id, scheduled_date)
  WHERE is_training_day = TRUE;
```

---

## Part 3: `calendarCoverage.js` — write `user_id` on new rows

Edit `api/src/services/calendarCoverage.js`.

The `ensureProgramCalendarCoverage` INSERT must now include `user_id` so all new recovery rows carry the owner. Replace the INSERT SQL:

```js
// api/src/services/calendarCoverage.js

export async function ensureProgramCalendarCoverage(pool, programId) {
  // Fill every missing date in the program window with a recovery row.
  // user_id is included so the idx_calendar_user_training_date partial index works.
  await pool.query(
    `
    INSERT INTO program_calendar_day (
      program_id,
      user_id,
      program_week_id,
      program_day_id,
      week_number,
      scheduled_offset_days,
      scheduled_weekday,
      scheduled_date,
      global_day_index,
      is_training_day,
      program_day_key
    )
    SELECT
      p.id                                                              AS program_id,
      p.user_id                                                        AS user_id,
      NULL::uuid                                                        AS program_week_id,
      NULL::uuid                                                        AS program_day_id,
      (gs.n / 7 + 1)::int                                              AS week_number,
      gs.n                                                             AS scheduled_offset_days,
      to_char(p.start_date + gs.n, 'dy')                               AS scheduled_weekday,
      p.start_date + gs.n                                              AS scheduled_date,
      (gs.n + 1)::int                                                  AS global_day_index,
      false                                                            AS is_training_day,
      'recovery:' || p.id::text || ':' || (p.start_date + gs.n)::text AS program_day_key
    FROM program p
    CROSS JOIN generate_series(0, p.weeks_count * 7 - 1) AS gs(n)
    WHERE p.id = $1::uuid
    ON CONFLICT (program_id, scheduled_date) DO NOTHING
    `,
    [programId],
  );

  // Guard: ensure any row that has a real program_day_id is marked as a training day.
  await pool.query(
    `
    UPDATE program_calendar_day
    SET is_training_day = true
    WHERE program_id = $1
      AND program_day_id IS NOT NULL
      AND is_training_day = false
    `,
    [programId],
  );
}
```

Also update the `importEmitterService.js` (wherever it inserts `program_calendar_day` training rows) to include `user_id = (SELECT user_id FROM program WHERE id = $programId)` in the INSERT. Search for `INSERT INTO program_calendar_day` in that file and add the column.

---

## Part 4: Generation conflict enforcement in `generateProgramV2.js`

Edit `api/src/routes/generateProgramV2.js`.

### 4a — Same-type duplicate check (Phase 1a, after resolving `pg_user_id`)

Add this check immediately after `pg_user_id` is resolved and before the program INSERT:

```js
// Inside the Phase 1/2 setupClient transaction, after pg_user_id is set:

// Block if an active program of the same type already exists for this user.
const sameTypeR = await setupClient.query(
  `SELECT id FROM program WHERE user_id = $1 AND program_type = $2 AND status = 'active' LIMIT 1`,
  [pg_user_id, programType],
);
if (sameTypeR.rowCount > 0) {
  await setupClient.query("ROLLBACK");
  setupClient.release();
  return res.status(409).json({
    ok: false,
    code: "conflict_active_program_same_type",
    error: `You already have an active ${programType} program. Archive it before generating a new one.`,
  });
}
```

### 4b — Calendar conflict check (Phase 5b, after `importEmitterPayload`)

Add this check **after** `importEmitterPayload` has committed training-day rows and **before** calling `ensureCalendar`. The training-day rows have been inserted at this point so we can compare against other active programs.

```js
// Phase 5b: Check for cross-program calendar conflicts.
// Fetch any training dates for this new program that collide with other
// active programs owned by the same user.
const conflictR = await db.query(
  `
  SELECT pcd_new.scheduled_date::text AS conflict_date,
         ep.program_type              AS existing_type
  FROM program_calendar_day pcd_new
  JOIN program_calendar_day pcd_existing
    ON pcd_existing.user_id = pcd_new.user_id
    AND pcd_existing.scheduled_date = pcd_new.scheduled_date
    AND pcd_existing.is_training_day = TRUE
    AND pcd_existing.program_id <> pcd_new.program_id
  JOIN program ep ON ep.id = pcd_existing.program_id AND ep.status = 'active'
  WHERE pcd_new.program_id = $1
    AND pcd_new.is_training_day = TRUE
  ORDER BY pcd_new.scheduled_date
  `,
  [created_program_id],
);

if (conflictR.rowCount > 0) {
  const conflictDates = [...new Set(conflictR.rows.map((r) => r.conflict_date))];
  const existingTypes = [...new Set(conflictR.rows.map((r) => r.existing_type))];
  // Mark program failed before rejecting so it doesn't linger as 'generating'.
  await markFailed("schedule_conflict");
  return res.status(409).json({
    ok: false,
    code: "schedule_conflict",
    error: "The new program overlaps with existing active sessions.",
    details: {
      conflict_dates: conflictDates,
      existing_program_types: existingTypes,
      suggestion: "Choose different preferred days or archive an active program first.",
    },
  });
}
```

Place this block immediately before the `await ensureCalendar(db, created_program_id)` call.

### 4c — Set `is_primary` on new program

After the conflict check passes, when the program status is updated to `'active'` (the Phase 5 UPDATE), also set `is_primary`:

```js
// Determine is_primary: first active program for this user becomes primary.
const hasPrimaryR = await db.query(
  `SELECT id FROM program WHERE user_id = $1 AND status = 'active' AND is_primary = TRUE LIMIT 1`,
  [pg_user_id],
);
const isPrimary = hasPrimaryR.rowCount === 0;

// Include is_primary in the Phase 5 UPDATE of the program row:
// (Add 'is_primary = $N' to the existing programUpdateAssignments array or do a
//  separate UPDATE immediately after the main program UPDATE)
await db.query(
  `UPDATE program SET is_primary = $1 WHERE id = $2`,
  [isPrimary, created_program_id],
);
```

---

## Part 5: Route module `api/src/routes/activePrograms.js`

Create this file. It implements four routes:
- `GET /api/programs/active`
- `GET /api/calendar/combined`
- `GET /api/sessions/by-date/:scheduled_date`
- `PATCH /api/program/:program_id/primary`

```js
// api/src/routes/activePrograms.js
import express from "express";
import { pool } from "../db.js";
import { userAuth } from "../middleware/chains.js";
import { safeString } from "../utils/validate.js";

export const activeProgramsRouter = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function asString(v, fallback = "") {
  return v == null ? fallback : String(v);
}

function toFinite(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  return ISO_DATE_RE.test(s) && !Number.isNaN(Date.parse(s));
}

// ─── GET /api/programs/active ────────────────────────────────────────────────
// Returns all active programs for the authenticated user plus today's sessions.

activeProgramsRouter.get("/programs/active", ...userAuth, async (req, res) => {
  const userId = req.auth.user_id;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // All active programs with today's session count and next session date.
    const programsR = await pool.query(
      `
      SELECT
        p.id                  AS program_id,
        p.program_title,
        p.program_type,
        p.is_primary,
        p.status,
        p.weeks_count,
        p.days_per_week,
        p.start_date::text    AS start_date,
        p.hero_media_id,
        -- Today's training session count for this program
        (
          SELECT COUNT(*)
          FROM program_calendar_day pcd
          WHERE pcd.program_id = p.id
            AND pcd.scheduled_date = $2::date
            AND pcd.is_training_day = TRUE
        )::int                AS today_session_count,
        -- Next scheduled training date from today
        (
          SELECT MIN(pcd2.scheduled_date)::text
          FROM program_calendar_day pcd2
          WHERE pcd2.program_id = p.id
            AND pcd2.scheduled_date >= $2::date
            AND pcd2.is_training_day = TRUE
        )                     AS next_session_date
      FROM program p
      WHERE p.user_id = $1
        AND p.status = 'active'
        AND p.is_ready = TRUE
      ORDER BY p.is_primary DESC, p.created_at ASC
      `,
      [userId, today],
    );

    // Today's cross-program sessions.
    const todayR = await pool.query(
      `
      SELECT
        p.id                AS program_id,
        pd.id               AS program_day_id,
        p.program_title,
        p.program_type,
        pd.day_label,
        pcd.scheduled_date::text AS scheduled_date
      FROM program_calendar_day pcd
      JOIN program p  ON p.id  = pcd.program_id
      JOIN program_day pd ON pd.id = pcd.program_day_id
      WHERE pcd.user_id = $1
        AND pcd.scheduled_date = $2::date
        AND pcd.is_training_day = TRUE
        AND p.status = 'active'
      ORDER BY p.is_primary DESC, p.program_type, p.program_title
      `,
      [userId, today],
    );

    const primaryRow = programsR.rows.find((r) => r.is_primary);

    return res.json({
      ok: true,
      primary_program_id: primaryRow ? asString(primaryRow.program_id) : null,
      programs: programsR.rows.map((r) => ({
        program_id: asString(r.program_id),
        program_title: asString(r.program_title),
        program_type: asString(r.program_type),
        is_primary: Boolean(r.is_primary),
        status: asString(r.status),
        weeks_count: toFinite(r.weeks_count),
        days_per_week: toFinite(r.days_per_week),
        start_date: asString(r.start_date),
        hero_media_id: r.hero_media_id == null ? null : asString(r.hero_media_id),
        today_session_count: toFinite(r.today_session_count),
        next_session_date: r.next_session_date ?? null,
      })),
      today_sessions: todayR.rows.map((r) => ({
        program_id: asString(r.program_id),
        program_day_id: asString(r.program_day_id),
        program_title: asString(r.program_title),
        program_type: asString(r.program_type),
        day_label: asString(r.day_label),
        scheduled_date: asString(r.scheduled_date),
      })),
    });
  } catch (err) {
    req.log?.error({ event: "activePrograms.error", err: err?.message });
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ─── GET /api/calendar/combined ──────────────────────────────────────────────
// Returns a merged calendar across all active programs.
// Query params: from=YYYY-MM-DD, to=YYYY-MM-DD (default: today + 28 days).

activeProgramsRouter.get("/calendar/combined", ...userAuth, async (req, res) => {
  const userId = req.auth.user_id;
  const today = new Date().toISOString().slice(0, 10);
  const defaultTo = new Date(Date.now() + 28 * 86400_000).toISOString().slice(0, 10);

  const fromRaw = safeString(req.query.from) || today;
  const toRaw = safeString(req.query.to) || defaultTo;

  if (!isValidDate(fromRaw) || !isValidDate(toRaw)) {
    return res.status(400).json({ ok: false, error: "Invalid date range. Use YYYY-MM-DD." });
  }
  if (fromRaw > toRaw) {
    return res.status(400).json({ ok: false, error: "'from' must not be after 'to'." });
  }

  try {
    const rows = await pool.query(
      `
      SELECT
        pcd.scheduled_date::text AS scheduled_date,
        p.id                     AS program_id,
        pd.id                    AS program_day_id,
        p.program_type,
        p.program_title,
        p.is_primary             AS is_primary_program,
        pd.day_label,
        pd.is_completed
      FROM program_calendar_day pcd
      JOIN program p   ON p.id  = pcd.program_id
      JOIN program_day pd ON pd.id = pcd.program_day_id
      WHERE pcd.user_id = $1
        AND pcd.scheduled_date BETWEEN $2::date AND $3::date
        AND pcd.is_training_day = TRUE
        AND p.status = 'active'
      ORDER BY pcd.scheduled_date ASC,
               p.is_primary DESC,
               p.program_type ASC,
               p.program_title ASC
      `,
      [userId, fromRaw, toRaw],
    );

    // Group sessions by date.
    const dateMap = new Map();
    for (const r of rows.rows) {
      const d = r.scheduled_date;
      if (!dateMap.has(d)) dateMap.set(d, []);
      dateMap.get(d).push({
        program_id: asString(r.program_id),
        program_day_id: asString(r.program_day_id),
        program_type: asString(r.program_type),
        program_title: asString(r.program_title),
        is_primary_program: Boolean(r.is_primary_program),
        day_label: asString(r.day_label),
        is_completed: Boolean(r.is_completed),
      });
    }

    const days = [...dateMap.entries()].map(([scheduled_date, sessions]) => ({
      scheduled_date,
      sessions,
    }));

    return res.json({ ok: true, days });
  } catch (err) {
    req.log?.error({ event: "calendar.combined.error", err: err?.message });
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ─── GET /api/sessions/by-date/:scheduled_date ───────────────────────────────
// Returns all active training sessions for the user on a given date.

activeProgramsRouter.get("/sessions/by-date/:scheduled_date", ...userAuth, async (req, res) => {
  const userId = req.auth.user_id;
  const dateParam = safeString(req.params.scheduled_date);

  if (!isValidDate(dateParam)) {
    return res.status(400).json({ ok: false, error: "Invalid date. Use YYYY-MM-DD." });
  }

  try {
    const rows = await pool.query(
      `
      SELECT
        p.id                AS program_id,
        pd.id               AS program_day_id,
        p.program_title,
        p.program_type,
        p.is_primary        AS is_primary_program,
        pd.day_label,
        pd.session_duration_mins,
        pd.is_completed
      FROM program_calendar_day pcd
      JOIN program p   ON p.id  = pcd.program_id
      JOIN program_day pd ON pd.id = pcd.program_day_id
      WHERE pcd.user_id = $1
        AND pcd.scheduled_date = $2::date
        AND pcd.is_training_day = TRUE
        AND p.status = 'active'
      ORDER BY p.is_primary DESC, p.program_type, p.program_title
      `,
      [userId, dateParam],
    );

    return res.json({
      ok: true,
      scheduled_date: dateParam,
      sessions: rows.rows.map((r) => ({
        program_id: asString(r.program_id),
        program_day_id: asString(r.program_day_id),
        program_title: asString(r.program_title),
        program_type: asString(r.program_type),
        is_primary_program: Boolean(r.is_primary_program),
        day_label: asString(r.day_label),
        session_duration_mins: r.session_duration_mins == null ? null : toFinite(r.session_duration_mins),
        is_completed: Boolean(r.is_completed),
      })),
    });
  } catch (err) {
    req.log?.error({ event: "sessions.byDate.error", err: err?.message });
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ─── PATCH /api/program/:program_id/primary ───────────────────────────────────
// Promotes one active program to primary; demotes the current primary.
// Both updates run in a single transaction.

activeProgramsRouter.patch("/program/:program_id/primary", ...userAuth, async (req, res) => {
  const userId = req.auth.user_id;
  const programId = safeString(req.params.program_id);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(programId)) {
    return res.status(400).json({ ok: false, error: "Invalid program_id." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify the program belongs to this user and is active.
    const verifyR = await client.query(
      `SELECT id FROM program WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [programId, userId],
    );
    if (verifyR.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Program not found or not active." });
    }

    // Demote current primary (if any).
    await client.query(
      `UPDATE program SET is_primary = FALSE WHERE user_id = $1 AND is_primary = TRUE AND status = 'active'`,
      [userId],
    );

    // Promote the requested program.
    await client.query(
      `UPDATE program SET is_primary = TRUE WHERE id = $1`,
      [programId],
    );

    await client.query("COMMIT");

    return res.json({ ok: true, primary_program_id: programId });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
    req.log?.error({ event: "program.setPrimary.error", err: err?.message });
    return res.status(500).json({ ok: false, error: "internal_error" });
  } finally {
    client.release();
  }
});
```

---

## Part 6: Register routes in `api/server.js`

Add the import and router registration to `api/server.js`. Follow the same pattern as existing routes.

```js
// Add to imports near the other route imports:
import { activeProgramsRouter } from "./src/routes/activePrograms.js";

// Add to the app.use() block near the other userAuth routes:
app.use("/api", activeProgramsRouter);
```

---

## Part 7: Tests for `activePrograms.js`

Create `api/src/routes/__tests__/activePrograms.test.js`.

```js
// api/src/routes/__tests__/activePrograms.test.js
import { describe, it, expect, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

// ── Mock pool ────────────────────────────────────────────────────────────────
const MOCK_POOLS = {
  programs: [],
  todaySessions: [],
  calendarRows: [],
  byDateRows: [],
  verifyRows: [],
};

const mockPool = {
  _calls: [],
  query(sql, params) {
    this._calls.push({ sql: sql.trim(), params });
    // Route responses by SQL content
    if (sql.includes("FROM program p") && sql.includes("today_session_count")) {
      return Promise.resolve({ rows: MOCK_POOLS.programs, rowCount: MOCK_POOLS.programs.length });
    }
    if (sql.includes("pcd.scheduled_date = $2") && sql.includes("TODAY")) {
      return Promise.resolve({ rows: MOCK_POOLS.todaySessions, rowCount: MOCK_POOLS.todaySessions.length });
    }
    if (sql.includes("BETWEEN $2")) {
      return Promise.resolve({ rows: MOCK_POOLS.calendarRows, rowCount: MOCK_POOLS.calendarRows.length });
    }
    if (sql.includes("by-date") || (sql.includes("pcd.scheduled_date = $2") && !sql.includes("TODAY"))) {
      return Promise.resolve({ rows: MOCK_POOLS.byDateRows, rowCount: MOCK_POOLS.byDateRows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  },
  connect() {
    const client = {
      _calls: [],
      query(sql, params) {
        this._calls.push({ sql, params });
        if (sql.includes("SELECT id FROM program WHERE id")) {
          return Promise.resolve({ rows: MOCK_POOLS.verifyRows, rowCount: MOCK_POOLS.verifyRows.length });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
      release() {},
    };
    return Promise.resolve(client);
  },
};

// ── Test setup ───────────────────────────────────────────────────────────────

// NOTE: In CI these tests use the real pool and real test database.
// The structure below shows the expected behavior; adapt to your test DB helpers
// if they differ from the mock approach above.

describe("GET /api/programs/active", () => {
  it("returns empty arrays when user has no active programs", async () => {
    // Arrange: user exists but has no active programs
    // Act: GET /api/programs/active with valid JWT
    // Assert:
    //   res.status === 200
    //   res.body.ok === true
    //   res.body.programs is []
    //   res.body.today_sessions is []
    //   res.body.primary_program_id === null
  });

  it("returns a single active program marked as primary", async () => {
    // Arrange: one active program for user, is_primary=true
    // Act: GET /api/programs/active
    // Assert:
    //   res.body.programs.length === 1
    //   res.body.programs[0].is_primary === true
    //   res.body.primary_program_id === programs[0].program_id
  });

  it("returns two active programs, primary listed first", async () => {
    // Arrange: two active programs, strength is_primary=true, conditioning is_primary=false
    // Act: GET /api/programs/active
    // Assert:
    //   res.body.programs.length === 2
    //   res.body.programs[0].program_type === 'strength'
    //   res.body.programs[0].is_primary === true
    //   res.body.programs[1].is_primary === false
  });

  it("returns 401 when unauthenticated", async () => {
    // Act: GET /api/programs/active without Authorization header
    // Assert: res.status === 401
  });
});

describe("GET /api/calendar/combined", () => {
  it("returns empty days array when user has no active programs", async () => {
    // Assert: res.body.days is []
  });

  it("returns days with sessions grouped by date", async () => {
    // Arrange: two programs, both with sessions on different dates
    // Assert:
    //   days are sorted by date ASC
    //   each day has sessions[] in correct order (primary first)
  });

  it("returns 400 for invalid date range", async () => {
    // Act: GET /api/calendar/combined?from=not-a-date
    // Assert: res.status === 400
  });

  it("returns 400 when from is after to", async () => {
    // Act: GET /api/calendar/combined?from=2026-05-01&to=2026-04-01
    // Assert: res.status === 400
  });
});

describe("GET /api/sessions/by-date/:scheduled_date", () => {
  it("returns empty sessions for a rest day", async () => {
    // Assert: res.body.sessions is []
  });

  it("returns one session when only one program has that day", async () => {
    // Assert: res.body.sessions.length === 1
  });

  it("returns multiple sessions when two programs share a date (pre-conflict-fix data)", async () => {
    // Assert: res.body.sessions.length === 2
    //   primary program first
  });

  it("returns 400 for invalid date format", async () => {
    // Act: GET /api/sessions/by-date/not-a-date
    // Assert: res.status === 400
  });
});

describe("PATCH /api/program/:program_id/primary", () => {
  it("promotes a secondary program to primary and demotes the old primary", async () => {
    // Arrange: two active programs, A is primary, B is secondary
    // Act: PATCH /api/program/B/primary
    // Assert:
    //   res.body.ok === true
    //   res.body.primary_program_id === B.id
    //   program A: is_primary = false
    //   program B: is_primary = true
    //   GET /api/programs/active now shows B as primary
  });

  it("returns 404 when program does not belong to user", async () => {
    // Act: PATCH /api/program/<other-users-program-id>/primary
    // Assert: res.status === 404
  });

  it("returns 404 when program is not active", async () => {
    // Act: PATCH on an archived program
    // Assert: res.status === 404
  });

  it("returns 400 for malformed program_id", async () => {
    // Act: PATCH /api/program/not-a-uuid/primary
    // Assert: res.status === 400
  });
});

describe("Generation conflict enforcement", () => {
  it("returns 409 conflict_active_program_same_type when generating duplicate type", async () => {
    // Arrange: user has active strength program
    // Act: POST /api/generate-plan-v2 with programType=strength
    // Assert:
    //   res.status === 409
    //   res.body.code === 'conflict_active_program_same_type'
  });

  it("returns 409 schedule_conflict when dates overlap", async () => {
    // Arrange: user has active strength program on Mon/Wed/Fri
    // Act: generate conditioning program also on Mon/Wed/Fri
    // Assert:
    //   res.status === 409
    //   res.body.code === 'schedule_conflict'
    //   res.body.details.conflict_dates is a non-empty array of ISO date strings
    //   res.body.details.existing_program_types includes 'strength'
  });

  it("succeeds when new program type is different and dates do not overlap", async () => {
    // Arrange: user has active strength program on Mon/Wed/Fri
    // Act: generate conditioning program on Tue/Thu/Sat
    // Assert: res.status === 200, new program is active, is_primary = false
  });
});
```

---

## Part 8: Mobile — TypeScript types

Create `mobile/src/api/activePrograms.ts`.

```ts
// mobile/src/api/activePrograms.ts
import { apiGet, apiPatch } from "./client"; // use your existing API client helper

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActiveProgramSummary {
  program_id: string;
  program_title: string;
  program_type: string;
  is_primary: boolean;
  status: string;
  weeks_count: number;
  days_per_week: number;
  start_date: string;
  hero_media_id: string | null;
  today_session_count: number;
  next_session_date: string | null;
}

export interface TodaySession {
  program_id: string;
  program_day_id: string;
  program_title: string;
  program_type: string;
  day_label: string;
  scheduled_date: string;
}

export interface ActiveProgramsResponse {
  ok: boolean;
  primary_program_id: string | null;
  programs: ActiveProgramSummary[];
  today_sessions: TodaySession[];
}

export interface CalendarSession {
  program_id: string;
  program_day_id: string;
  program_type: string;
  program_title: string;
  is_primary_program: boolean;
  day_label: string;
  is_completed: boolean;
}

export interface CalendarDay {
  scheduled_date: string;
  sessions: CalendarSession[];
}

export interface CombinedCalendarResponse {
  ok: boolean;
  days: CalendarDay[];
}

export interface SessionsByDateItem {
  program_id: string;
  program_day_id: string;
  program_title: string;
  program_type: string;
  is_primary_program: boolean;
  day_label: string;
  session_duration_mins: number | null;
  is_completed: boolean;
}

export interface SessionsByDateResponse {
  ok: boolean;
  scheduled_date: string;
  sessions: SessionsByDateItem[];
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchActivePrograms(): Promise<ActiveProgramsResponse> {
  return apiGet("/api/programs/active");
}

export async function fetchCombinedCalendar(
  from?: string,
  to?: string,
): Promise<CombinedCalendarResponse> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/calendar/combined${qs}`);
}

export async function fetchSessionsByDate(
  scheduledDate: string,
): Promise<SessionsByDateResponse> {
  return apiGet(`/api/sessions/by-date/${scheduledDate}`);
}

export async function setPrimaryProgram(
  programId: string,
): Promise<{ ok: boolean; primary_program_id: string }> {
  return apiPatch(`/api/program/${programId}/primary`, {});
}
```

---

## Part 9: Mobile — Program Hub screen

Create `mobile/src/screens/program/ProgramHubScreen.tsx`.

```tsx
// mobile/src/screens/program/ProgramHubScreen.tsx
import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchActivePrograms,
  setPrimaryProgram,
  type ActiveProgramSummary,
  type TodaySession,
} from "../../api/activePrograms";
import { colors } from "../../theme/colors";

// ─── Program type color map ───────────────────────────────────────────────────
const PROGRAM_TYPE_COLORS: Record<string, string> = {
  strength: "#3B82F6",       // blue
  hypertrophy: "#22C55E",    // green
  conditioning: "#F59E0B",   // amber
  hyrox: "#EF4444",          // red
};

function typeBadgeColor(programType: string): string {
  return PROGRAM_TYPE_COLORS[programType] ?? "#6B7280";
}

// ─── ProgramCard ─────────────────────────────────────────────────────────────

interface ProgramCardProps {
  program: ActiveProgramSummary;
  onPress: (programId: string) => void;
  onMakePrimary: (programId: string) => void;
}

function ProgramCard({ program, onPress, onMakePrimary }: ProgramCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, program.is_primary && styles.primaryCard]}
      onPress={() => onPress(program.program_id)}
      accessibilityRole="button"
      accessibilityLabel={`${program.program_title}, ${program.is_primary ? "primary" : "secondary"} program`}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: typeBadgeColor(program.program_type) }]}>
          <Text style={styles.typeBadgeText}>{program.program_type.toUpperCase()}</Text>
        </View>
        {program.is_primary ? (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>PRIMARY</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.cardTitle}>{program.program_title}</Text>
      <Text style={styles.cardMeta}>
        {program.weeks_count}w · {program.days_per_week}x/week
      </Text>
      {program.next_session_date ? (
        <Text style={styles.cardMeta}>Next: {program.next_session_date}</Text>
      ) : null}

      {!program.is_primary ? (
        <TouchableOpacity
          style={styles.makePrimaryBtn}
          onPress={() => onMakePrimary(program.program_id)}
          accessibilityRole="button"
          accessibilityLabel={`Make ${program.program_title} your primary program`}
        >
          <Text style={styles.makePrimaryText}>Make primary</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── TodaySessionRow ──────────────────────────────────────────────────────────

interface TodaySessionRowProps {
  session: TodaySession;
  onPress: (programDayId: string) => void;
}

function TodaySessionRow({ session, onPress }: TodaySessionRowProps) {
  return (
    <TouchableOpacity
      style={styles.sessionRow}
      onPress={() => onPress(session.program_day_id)}
      accessibilityRole="button"
    >
      <View
        style={[styles.sessionDot, { backgroundColor: typeBadgeColor(session.program_type) }]}
        accessibilityLabel={session.program_type}
      />
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionLabel}>{session.day_label}</Text>
        <Text style={styles.sessionProgram}>{session.program_title}</Text>
      </View>
      <Text style={styles.sessionChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─── ProgramHubScreen ─────────────────────────────────────────────────────────

interface ProgramHubScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export function ProgramHubScreen({ navigation }: ProgramHubScreenProps) {
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["activePrograms"],
    queryFn: fetchActivePrograms,
  });

  const makePrimaryMutation = useMutation({
    mutationFn: setPrimaryProgram,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activePrograms"] });
    },
  });

  function handleOpenProgram(programId: string) {
    navigation.navigate("ProgramOverview", { programId });
  }

  function handleOpenSession(programDayId: string) {
    navigation.navigate("DayDetail", { programDayId });
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load programs.</Text>
        <TouchableOpacity onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { programs, today_sessions } = data;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={programs}
      keyExtractor={(item) => item.program_id}
      ListHeaderComponent={
        <>
          {today_sessions.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Today's Sessions</Text>
              {today_sessions.map((s) => (
                <TodaySessionRow
                  key={s.program_day_id}
                  session={s}
                  onPress={handleOpenSession}
                />
              ))}
            </View>
          ) : null}
          <Text style={styles.sectionTitle}>Active Programs</Text>
        </>
      }
      renderItem={({ item }) => (
        <ProgramCard
          program={item}
          onPress={handleOpenProgram}
          onMakePrimary={(id) => makePrimaryMutation.mutate(id)}
        />
      )}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No active programs. Generate one to get started.</Text>
      }
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, marginBottom: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryCard: { borderColor: colors.accent },
  cardHeader: { flexDirection: "row", gap: 8, alignItems: "center" },
  typeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  primaryBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.accent },
  primaryBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.textPrimary },
  cardMeta: { fontSize: 13, color: colors.textSecondary },
  makePrimaryBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  makePrimaryText: { color: colors.accent, fontSize: 13 },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sessionDot: { width: 10, height: 10, borderRadius: 5 },
  sessionInfo: { flex: 1 },
  sessionLabel: { fontSize: 15, fontWeight: "500", color: colors.textPrimary },
  sessionProgram: { fontSize: 12, color: colors.textSecondary },
  sessionChevron: { fontSize: 18, color: colors.textSecondary },
  emptyText: { color: colors.textSecondary, textAlign: "center", marginTop: 32 },
  errorText: { color: colors.textSecondary, marginBottom: 12 },
  retryText: { color: colors.accent },
});
```

---

## Part 10: Mobile — Combined Calendar component

Create `mobile/src/components/program/CombinedCalendar.tsx`.

```tsx
// mobile/src/components/program/CombinedCalendar.tsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type { CalendarDay, CalendarSession } from "../../api/activePrograms";
import { colors } from "../../theme/colors";

// ─── Program type colors (match ProgramHubScreen) ────────────────────────────
const PROGRAM_TYPE_COLORS: Record<string, string> = {
  strength: "#3B82F6",
  hypertrophy: "#22C55E",
  conditioning: "#F59E0B",
  hyrox: "#EF4444",
};

function dotColor(programType: string): string {
  return PROGRAM_TYPE_COLORS[programType] ?? "#6B7280";
}

// ─── SessionDot ───────────────────────────────────────────────────────────────
function SessionDot({ session }: { session: CalendarSession }) {
  return (
    <View
      style={[styles.dot, { backgroundColor: dotColor(session.program_type) }]}
      accessibilityLabel={`${session.program_type} session`}
    />
  );
}

// ─── CalendarDayCell ──────────────────────────────────────────────────────────

interface CalendarDayCellProps {
  day: CalendarDay;
  onPress: (day: CalendarDay) => void;
}

function CalendarDayCell({ day, onPress }: CalendarDayCellProps) {
  const [, , d] = day.scheduled_date.split("-");
  const sessionCount = day.sessions.length;
  const hasMultiple = sessionCount > 1;

  return (
    <TouchableOpacity
      style={styles.cell}
      onPress={() => onPress(day)}
      accessibilityRole="button"
      accessibilityLabel={`${day.scheduled_date}, ${sessionCount} session${sessionCount !== 1 ? "s" : ""}`}
    >
      <Text style={styles.cellDate}>{d}</Text>
      <View style={styles.dotsRow}>
        {day.sessions.slice(0, 3).map((s, i) => (
          <SessionDot key={`${s.program_id}-${i}`} session={s} />
        ))}
      </View>
      {hasMultiple ? (
        <Text style={styles.countBadge}>{sessionCount}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── CombinedCalendar ─────────────────────────────────────────────────────────

interface CombinedCalendarProps {
  days: CalendarDay[];
  onDayPress: (day: CalendarDay) => void;
}

export function CombinedCalendar({ days, onDayPress }: CombinedCalendarProps) {
  if (days.length === 0) {
    return <Text style={styles.empty}>No sessions scheduled in this range.</Text>;
  }

  return (
    <View style={styles.container}>
      {days.map((day) => (
        <CalendarDayCell key={day.scheduled_date} day={day} onPress={onDayPress} />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: {
    width: 52,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cellDate: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  dotsRow: { flexDirection: "row", gap: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  countBadge: { fontSize: 10, color: colors.textSecondary, fontWeight: "700" },
  empty: { color: colors.textSecondary, textAlign: "center", marginVertical: 16 },
});
```

---

## Part 11: Mobile — Session Picker bottom sheet

Create `mobile/src/components/program/SessionPickerSheet.tsx`.

```tsx
// mobile/src/components/program/SessionPickerSheet.tsx
import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import type { SessionsByDateItem } from "../../api/activePrograms";
import { colors } from "../../theme/colors";

const PROGRAM_TYPE_COLORS: Record<string, string> = {
  strength: "#3B82F6",
  hypertrophy: "#22C55E",
  conditioning: "#F59E0B",
  hyrox: "#EF4444",
};

interface SessionPickerSheetProps {
  visible: boolean;
  scheduledDate: string;
  sessions: SessionsByDateItem[];
  onSelectSession: (programDayId: string) => void;
  onClose: () => void;
}

export function SessionPickerSheet({
  visible,
  scheduledDate,
  sessions,
  onSelectSession,
  onClose,
}: SessionPickerSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1} />
      <SafeAreaView style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.dateHeader}>{scheduledDate}</Text>
        <Text style={styles.subtitle}>Choose a session</Text>
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.program_day_id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.sessionCard}
              onPress={() => {
                onClose();
                onSelectSession(item.program_day_id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.program_title}: ${item.day_label}`}
            >
              <View
                style={[
                  styles.typeBar,
                  { backgroundColor: PROGRAM_TYPE_COLORS[item.program_type] ?? "#6B7280" },
                ]}
              />
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionTitle}>{item.program_title}</Text>
                <Text style={styles.sessionLabel}>{item.day_label}</Text>
                {item.session_duration_mins != null ? (
                  <Text style={styles.sessionMeta}>{item.session_duration_mins} min</Text>
                ) : null}
                {item.is_completed ? (
                  <Text style={styles.completedBadge}>Completed</Text>
                ) : null}
              </View>
              {item.is_primary_program ? (
                <Text style={styles.primaryIndicator}>★</Text>
              ) : null}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: "70%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginVertical: 12,
  },
  dateHeader: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  list: { gap: 10 },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeBar: { width: 4, alignSelf: "stretch" },
  sessionInfo: { flex: 1, padding: 12, gap: 2 },
  sessionTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  sessionLabel: { fontSize: 13, color: colors.textSecondary },
  sessionMeta: { fontSize: 12, color: colors.textSecondary },
  completedBadge: { fontSize: 12, color: "#22C55E", fontWeight: "600" },
  primaryIndicator: { color: colors.accent, fontSize: 18, paddingRight: 12 },
});
```

---

## Part 12: Wire `ProgramHubScreen` into navigation

In `mobile/src/navigation/AppTabs.tsx` (or wherever the Program tab stack is defined), replace the direct `ProgramOverview` entry point with `ProgramHubScreen` as the stack root.

Conceptually:

```tsx
// Before (single program):
<Stack.Screen name="ProgramOverview" component={ProgramOverviewScreen} />

// After (multi-program hub as root, overview reachable from it):
<Stack.Screen name="ProgramHub" component={ProgramHubScreen} />
<Stack.Screen name="ProgramOverview" component={ProgramOverviewScreen} />
```

The Program tab's `initialRouteName` should become `"ProgramHub"`.

When navigating from `ProgramHubScreen`:
- tapping a program card → `navigation.navigate("ProgramOverview", { programId })`
- tapping a today's session row → `navigation.navigate("DayDetail", { programDayId })`
- tapping a combined calendar day with one session → `navigation.navigate("DayDetail", { programDayId: day.sessions[0].program_day_id })`
- tapping a combined calendar day with multiple sessions → open `SessionPickerSheet` with the result of `fetchSessionsByDate(day.scheduled_date)`

---

## Spec ambiguities resolved by this prompt

1. **Where to place the same-type check in generation:** Phase 1a, inside the setup transaction, before the program INSERT — this avoids creating a ghost `'generating'` row that would need cleanup.

2. **Where to place the calendar conflict check:** After `importEmitterPayload` commits (training-day rows now exist in `program_calendar_day`) and before `ensureCalendar` fills recovery rows — this is where the candidate schedule is concrete.

3. **`is_primary` assignment on generation:** After the conflict check passes, check whether any other active+primary program exists for the user. If none, the new program becomes primary. This means: first program is always primary; subsequent (different-type) programs are secondary by default.

4. **`user_id` in `program_calendar_day` inserts from `importEmitterService`:** Also add `user_id` there. The `ensureProgramCalendarCoverage` function covers recovery rows (via `p.user_id`), but training-day rows are inserted by `importEmitterService` — that file must also write `user_id`.

5. **Demote-then-promote in `PATCH /primary`:** Run as a single transaction: UPDATE all active programs for the user to `is_primary=FALSE`, then UPDATE the target to `is_primary=TRUE`. This is safe because the unique partial index only fires on commit; within the transaction both writes are in flight together.

6. **`session_duration_mins` source:** Read from `program_day.session_duration_mins`. If that column does not yet exist, expose it as `null` in the API until added — the mobile renders it conditionally.

---

## Implementation order

1. Run V66 + V67 migrations.
2. Update `calendarCoverage.js` to write `user_id` (Part 3).
3. Update `importEmitterService.js` to write `user_id` on training-day inserts.
4. Add conflict enforcement to `generateProgramV2.js` (Part 4).
5. Create `activePrograms.js` route module (Part 5).
6. Register in `server.js` (Part 6).
7. Write tests (Part 7).
8. Add mobile types + API layer (Part 8).
9. Build `ProgramHubScreen` (Part 9).
10. Build `CombinedCalendar` component (Part 10).
11. Build `SessionPickerSheet` (Part 11).
12. Wire navigation (Part 12).
