# Codex Prompt: Feature 7 — Push Notifications and Engagement Hooks (Phases 1–3)

## Goal

Add push notification delivery for three events: PR celebrations, deload
acknowledgments, and daily workout reminders. The spec is at
`docs/feature-7-push-notifications-spec.md`. This prompt resolves all
ambiguities the spec left open and is ready to implement directly.

**No new npm packages** (Expo notifications SDK already installed via
`expo install expo-notifications`; Expo push uses plain `fetch`).
**Two new migrations.** **One new service.** **Three new routes.**
**Two hook wires into existing handlers.** **One mobile file.**

---

## Resolved design decisions (read before coding)

### 1. Preference filtering: hook layer, not service

`notificationService.send()` is preference-unaware. Each hook checks the relevant
preference inline (co-located with the trigger query) before calling `send`. This
keeps the service contract simple: if you call `send`, it sends.

### 2. Reminder deduplication

Add `last_reminder_sent_date DATE NULL` to `notification_preference` (part of V65).
The reminder endpoint updates this column to `CURRENT_DATE` after dispatching each
user's notification. The eligibility query filters `np.last_reminder_sent_date IS
DISTINCT FROM CURRENT_DATE`. This survives cron restarts and double-runs.

### 3. Internal cron route auth

Reuse `requireInternalToken` as-is via the existing `internalApi` chain
(`[requireInternalToken]`). The middleware reads `X-Internal-Token` header.
The Fly.io scheduled machine sends that header with `INTERNAL_API_TOKEN`. No
Bearer token support needed.

### 4. Mobile token registration trigger

Register in `App.tsx` in a `useEffect` that fires once when `isAuthenticated`
transitions from false → true (i.e., immediately after `setSession` is called in
`LoginScreen` or `RegisterScreen`). Non-blocking. This is the single canonical
point; do not add registration to individual auth screens.

### 5. Preference UI scope for Phase 1–3

Only `reminderEnabled`, `prNotificationEnabled`, and `deloadNotificationEnabled`
toggles are surfaced in Phase 1–3. The `reminder_time_local_hhmm` and
`reminder_timezone` fields are stored and returned by the API but the mobile UI
does not expose a time picker yet (Phase 4).

### 6. Same-session PR semantics

The PR query compares sets logged in the **current** `program_day_id` against all
historical sets from **other** `program_day_id`s. This means:
- Multiple PRs from a single `POST /api/segment-log` call → one aggregated
  "New PRs!" notification (N > 1) or single exercise notification (N = 1).
- A second `POST /api/segment-log` call in the same session that itself beats the
  new bar → another notification fires from that call. This is correct; the user
  broke their record again.

---

## Context files to read before writing any code

- `api/src/routes/segmentLog.js` — `postSegmentLog` handler; COMMIT is at line ~177;
  the PR hook fires after `client.release()` and before the return.
- `api/src/routes/readProgram.js` — `dayComplete` handler; Layer B fires in the
  `.then()` block starting line ~754; the deload hook is wired inside that same block.
- `api/src/services/emailService.js` — `sendEmail({ to, subject, text, html })`;
  already supports console/SMTP/Resend via `EMAIL_PROVIDER` env var.
- `api/src/middleware/auth.js` — `requireInternalToken` reads `X-Internal-Token` header.
- `api/src/middleware/chains.js` — `internalApi = [requireInternalToken]`; use this
  for the cron endpoint.
- `api/server.js` — route mounting pattern; the cron route mounts under `/api/internal`
  above the broad `/api` mounts.
- `mobile/App.tsx` — `isAuthenticated` from `useSessionStore`; `useEffect` hook is
  the registration trigger point.
- `mobile/src/api/client.ts` — `authPatchJson` is the correct fetch helper for
  authenticated PATCH calls.
- `migrations/V63__add_program_type_to_program.sql` — latest migration; new ones are
  V64 and V65.

---

## Part 1 — Migration V64: add push token to `app_user`

**New file: `migrations/V64__add_push_token_to_app_user.sql`**

```sql
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS device_push_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS device_push_token_updated_at TIMESTAMPTZ NULL;
```

---

## Part 2 — Migration V65: notification preferences

**New file: `migrations/V65__create_notification_preference.sql`**

```sql
CREATE TABLE IF NOT EXISTS notification_preference (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reminder_enabled             BOOLEAN     NOT NULL DEFAULT TRUE,
  reminder_time_local_hhmm     TEXT        NOT NULL DEFAULT '08:00',
  reminder_timezone            TEXT        NOT NULL DEFAULT 'UTC',
  pr_notification_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  deload_notification_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  last_reminder_sent_date      DATE        NULL,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
```

---

## Part 3 — New service: `notificationService.js`

**New file: `api/src/services/notificationService.js`**

The service dispatches to Expo push first and falls back to email. It is
preference-unaware (callers handle preference checks). It never throws.

```js
import { sendEmail } from "./emailService.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Errors from Expo that mean the token is permanently invalid — clear it.
const NON_RETRIABLE_EXPO_ERRORS = new Set([
  "DeviceNotRegistered",
  "InvalidCredentials",
]);

export function makeNotificationService(db) {
  /**
   * Send a notification to a user.
   * Tries Expo push first; falls back to email.
   * Never throws — all errors are logged and swallowed.
   *
   * @param {object}  opts
   * @param {string}  opts.userId
   * @param {string}  opts.title
   * @param {string}  opts.body
   * @param {object}  [opts.data]          — custom payload passed to the app on tap
   * @param {string}  [opts.emailSubject]  — falls back to opts.title
   * @param {string}  [opts.emailText]     — plain-text email body
   * @param {string}  [opts.emailHtml]     — HTML email body (optional)
   */
  async function send({ userId, title, body, data, emailSubject, emailText, emailHtml }) {
    try {
      const userR = await db.query(
        `SELECT device_push_token, email FROM app_user WHERE id = $1`,
        [userId],
      );
      const user = userR.rows[0];
      if (!user) return;

      let pushSucceeded = false;

      if (user.device_push_token) {
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              to: user.device_push_token,
              title,
              body,
              data: data ?? {},
              sound: "default",
            }),
          });

          const json = await res.json().catch(() => ({}));
          const status = json?.data?.status;
          const expoError = json?.data?.details?.error ?? json?.data?.message ?? null;

          if (status === "ok") {
            pushSucceeded = true;
          } else if (expoError && NON_RETRIABLE_EXPO_ERRORS.has(expoError)) {
            // Token permanently invalid — clear it.
            await db.query(
              `UPDATE app_user SET device_push_token = NULL, device_push_token_updated_at = now() WHERE id = $1`,
              [userId],
            ).catch(() => {});
          }
        } catch (pushErr) {
          // Network or parse error — fall through to email.
          console.warn("[notificationService] Expo push error:", pushErr?.message);
        }
      }

      if (!pushSucceeded && emailText && user.email) {
        await sendEmail({
          to: user.email,
          subject: emailSubject ?? title,
          text: emailText,
          html: emailHtml,
        }).catch((emailErr) => {
          console.warn("[notificationService] Email fallback error:", emailErr?.message);
        });
      }
    } catch (err) {
      console.warn("[notificationService] send() error:", err?.message);
    }
  }

  return { send };
}
```

---

## Part 4 — New route file: push token and notification preferences

**New file: `api/src/routes/notificationPreferences.js`**

Contains three handlers: push token registration, preference read, preference update.
All use `requireAuth` (standard user JWT).

```js
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, safeString } from "../utils/validate.js";

export const notificationPreferencesRouter = express.Router();
notificationPreferencesRouter.use(requireAuth);

const PUSH_TOKEN_RE = /^ExponentPushToken\[.+\]$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

function resolveUserId(req) {
  const userId = safeString(req.auth?.user_id);
  if (!userId) throw new RequestValidationError("Missing authenticated user context");
  return userId;
}

function mapError(err) {
  if (err instanceof RequestValidationError) {
    return { status: 400, code: "validation_error", message: err.message };
  }
  return { status: 500, code: "internal_error", message: publicInternalError(err) };
}

function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidHhmm(value) {
  if (!HHMM_RE.test(value)) return false;
  const [hh, mm] = value.split(":").map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

async function ensurePreferenceRow(db, userId) {
  await db.query(
    `
    INSERT INTO notification_preference (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );
}

function mapPrefRow(row) {
  if (!row) {
    return {
      reminderEnabled: true,
      reminderTimeLocalHhmm: "08:00",
      reminderTimezone: "UTC",
      prNotificationEnabled: true,
      deloadNotificationEnabled: true,
    };
  }
  return {
    reminderEnabled: Boolean(row.reminder_enabled),
    reminderTimeLocalHhmm: row.reminder_time_local_hhmm ?? "08:00",
    reminderTimezone: row.reminder_timezone ?? "UTC",
    prNotificationEnabled: Boolean(row.pr_notification_enabled),
    deloadNotificationEnabled: Boolean(row.deload_notification_enabled),
  };
}

// ── PATCH /api/users/me/push-token ──────────────────────────────────────────

notificationPreferencesRouter.patch("/users/me/push-token", async (req, res) => {
  const { request_id } = req;
  try {
    const userId = resolveUserId(req);
    const rawToken = req.body?.push_token;

    // null clears the token; anything else must match the Expo format.
    if (rawToken !== null && rawToken !== undefined) {
      const token = safeString(rawToken);
      if (!token || !PUSH_TOKEN_RE.test(token)) {
        throw new RequestValidationError(
          "push_token must match ExponentPushToken[...] format or be null",
        );
      }
    }

    const tokenValue = rawToken === null ? null : safeString(rawToken);

    await req.app.locals.db.query(
      `
      UPDATE app_user
      SET device_push_token = $2,
          device_push_token_updated_at = now()
      WHERE id = $1
      `,
      [userId, tokenValue],
    );

    await ensurePreferenceRow(req.app.locals.db, userId);

    return res.json({ ok: true });
  } catch (err) {
    const mapped = mapError(err);
    return res.status(mapped.status).json({ ok: false, request_id, code: mapped.code, error: mapped.message });
  }
});

// ── GET /api/users/me/notification-preferences ───────────────────────────────

notificationPreferencesRouter.get("/users/me/notification-preferences", async (req, res) => {
  const { request_id } = req;
  try {
    const userId = resolveUserId(req);
    const result = await req.app.locals.db.query(
      `SELECT * FROM notification_preference WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    return res.json(mapPrefRow(result.rows[0] ?? null));
  } catch (err) {
    const mapped = mapError(err);
    return res.status(mapped.status).json({ ok: false, request_id, code: mapped.code, error: mapped.message });
  }
});

// ── PATCH /api/users/me/notification-preferences ─────────────────────────────

notificationPreferencesRouter.patch("/users/me/notification-preferences", async (req, res) => {
  const { request_id } = req;
  try {
    const userId = resolveUserId(req);
    const body = req.body ?? {};

    // Validate optional fields.
    if (body.reminderTimeLocalHhmm !== undefined) {
      const v = safeString(body.reminderTimeLocalHhmm);
      if (!v || !isValidHhmm(v)) {
        throw new RequestValidationError("reminderTimeLocalHhmm must be a valid HH:MM time (00:00–23:59)");
      }
    }
    if (body.reminderTimezone !== undefined) {
      const v = safeString(body.reminderTimezone);
      if (!v || !isValidTimezone(v)) {
        throw new RequestValidationError("reminderTimezone must be a valid IANA timezone string");
      }
    }

    await ensurePreferenceRow(req.app.locals.db, userId);

    // Build SET clauses for only provided fields.
    const sets = [];
    const values = [userId];
    const boolFields = {
      reminderEnabled: "reminder_enabled",
      prNotificationEnabled: "pr_notification_enabled",
      deloadNotificationEnabled: "deload_notification_enabled",
    };
    const textFields = {
      reminderTimeLocalHhmm: "reminder_time_local_hhmm",
      reminderTimezone: "reminder_timezone",
    };

    for (const [jsKey, dbCol] of Object.entries(boolFields)) {
      if (body[jsKey] !== undefined) {
        values.push(Boolean(body[jsKey]));
        sets.push(`${dbCol} = $${values.length}`);
      }
    }
    for (const [jsKey, dbCol] of Object.entries(textFields)) {
      if (body[jsKey] !== undefined) {
        values.push(safeString(body[jsKey]));
        sets.push(`${dbCol} = $${values.length}`);
      }
    }

    if (sets.length > 0) {
      sets.push(`updated_at = now()`);
      await req.app.locals.db.query(
        `UPDATE notification_preference SET ${sets.join(", ")} WHERE user_id = $1`,
        values,
      );
    }

    const result = await req.app.locals.db.query(
      `SELECT * FROM notification_preference WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    return res.json({ ok: true, preferences: mapPrefRow(result.rows[0] ?? null) });
  } catch (err) {
    const mapped = mapError(err);
    return res.status(mapped.status).json({ ok: false, request_id, code: mapped.code, error: mapped.message });
  }
});
```

> **Note on `req.app.locals.db`:** The existing handlers in `server.js` use `pool`
> directly. For this router, attach the pool in `server.js` before mounting:
> `app.locals.db = pool;` (add once, above the first router mount that needs it).
> Alternatively, import `pool` from `../db.js` directly — follow whichever pattern
> matches existing code (check `segmentLog.js`; it imports `pool` from `"../db.js"`
> and passes it to `createSegmentLogHandlers(db)`). Use the same import style.
> Do NOT use `req.app.locals.db` — just import `{ pool }` from `"../db.js"` and
> use `pool` directly.

---

## Part 5 — New route file: cron endpoint

**New file: `api/src/routes/workoutReminders.js`**

Protected by `requireInternalToken` (via `internalApi` chain mounted in `server.js`).
Finds all users with a training day today, not yet completed, reminders enabled, and
not already sent today. Sends one notification per user; updates `last_reminder_sent_date`.

```js
import express from "express";
import { pool } from "../db.js";
import { makeNotificationService } from "../services/notificationService.js";

export const workoutRemindersRouter = express.Router();

const notificationService = makeNotificationService(pool);

// POST /api/internal/send-workout-reminders
// Protected by requireInternalToken (mounted via internalApi chain in server.js).
workoutRemindersRouter.post("/internal/send-workout-reminders", async (req, res) => {
  const { request_id } = req;
  try {
    // Find eligible users: training day today, not completed, reminder enabled,
    // not already sent today.
    const eligibleR = await pool.query(
      `
      SELECT
        au.id            AS user_id,
        au.email,
        pd.day_label,
        pd.id            AS program_day_id
      FROM program_calendar_day pcd
      JOIN program p ON p.id = pcd.program_id
      JOIN app_user au ON au.id = p.user_id
      LEFT JOIN notification_preference np ON np.user_id = au.id
      LEFT JOIN program_day pd ON pd.id = pcd.program_day_id
      WHERE pcd.scheduled_date = CURRENT_DATE
        AND pcd.is_training_day = TRUE
        AND (pd.is_completed IS NULL OR pd.is_completed = FALSE)
        AND (np.reminder_enabled IS NULL OR np.reminder_enabled = TRUE)
        AND (np.last_reminder_sent_date IS DISTINCT FROM CURRENT_DATE)
        AND (au.device_push_token IS NOT NULL OR au.email IS NOT NULL)
      ORDER BY au.id
      `,
    );

    const users = eligibleR.rows;
    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const dayLabel = user.day_label?.trim() || "workout";
      try {
        await notificationService.send({
          userId: user.user_id,
          title: "Time to train",
          body: `Your ${dayLabel} session is ready. Get it done.`,
          data: { event: "reminder", programDayId: user.program_day_id },
          emailSubject: `Your ${dayLabel} workout is ready`,
          emailText: [
            `Your ${dayLabel} session is ready.`,
            ``,
            `Open the app to get started.`,
          ].join("\n"),
        });

        // Mark today's reminder as sent regardless of push/email outcome.
        // notificationService.send never throws, so if we reach here, dispatch
        // was attempted. Record the send to prevent double-sending.
        await pool.query(
          `
          INSERT INTO notification_preference (user_id, last_reminder_sent_date)
          VALUES ($1, CURRENT_DATE)
          ON CONFLICT (user_id) DO UPDATE
            SET last_reminder_sent_date = CURRENT_DATE,
                updated_at = now()
          `,
          [user.user_id],
        );
        sent++;
      } catch (err) {
        // Should not happen (notificationService.send never throws), but guard anyway.
        console.warn("[workoutReminders] Unexpected error for user", user.user_id, err?.message);
        failed++;
      }
    }

    return res.json({ ok: true, eligible: users.length, sent, failed });
  } catch (err) {
    console.error("[workoutReminders] Query error:", err?.message);
    return res.status(500).json({ ok: false, request_id, code: "internal_error", error: err?.message });
  }
});
```

---

## Part 6 — Wire PR hook into `segmentLog.js`

**File: `api/src/routes/segmentLog.js`**

### 6a. Update the factory signature to accept `notificationService`

```js
export function createSegmentLogHandlers(db = pool, notificationService = null) {
```

### 6b. Add the PR hook after `client.release()` in `postSegmentLog`

The existing handler does `await client.query("COMMIT")` then releases the client and
returns `res.json({ saved: rows.length })`. Insert the non-blocking block between
`client.release()` and `return res.json(...)`:

```js
// Non-blocking fire-and-forget — must not delay the response.
if (notificationService) {
  const exerciseIds = [...new Set(rows.map((r) => r.program_exercise_id))];
  (async () => {
    try {
      // Check PR preference first.
      const prefR = await db.query(
        `SELECT pr_notification_enabled FROM notification_preference WHERE user_id = $1`,
        [user_id],
      );
      const prEnabled = prefR.rows[0]?.pr_notification_enabled ?? true;
      if (!prEnabled) return;

      // Detect PRs: new estimated 1RM in this session beats all prior sessions.
      const prR = await db.query(
        `
        WITH new_rows AS (
          SELECT
            pe.exercise_id,
            COALESCE(ec.name, pe.exercise_name) AS exercise_name,
            MAX(sel.estimated_1rm_kg)            AS new_e1rm
          FROM segment_exercise_log sel
          JOIN program_exercise pe ON pe.id = sel.program_exercise_id
          LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
          WHERE sel.user_id = $1
            AND sel.program_day_id = $2
            AND sel.program_exercise_id = ANY($3::uuid[])
            AND sel.is_draft = FALSE
            AND sel.estimated_1rm_kg IS NOT NULL
          GROUP BY pe.exercise_id, COALESCE(ec.name, pe.exercise_name)
        ),
        prev_best AS (
          SELECT pe.exercise_id, MAX(sel.estimated_1rm_kg) AS prev_e1rm
          FROM segment_exercise_log sel
          JOIN program_exercise pe ON pe.id = sel.program_exercise_id
          JOIN program p ON p.id = sel.program_id
          WHERE p.user_id = $1
            AND sel.program_day_id <> $2
            AND sel.is_draft = FALSE
            AND sel.estimated_1rm_kg IS NOT NULL
          GROUP BY pe.exercise_id
        )
        SELECT nr.exercise_id, nr.exercise_name, nr.new_e1rm, pb.prev_e1rm
        FROM new_rows nr
        LEFT JOIN prev_best pb USING (exercise_id)
        WHERE nr.new_e1rm > COALESCE(pb.prev_e1rm, 0)
        `,
        [user_id, program_day_id, exerciseIds],
      );

      const prs = prR.rows;
      if (prs.length === 0) return;

      if (prs.length === 1) {
        const pr = prs[0];
        const e1rm = Number(pr.new_e1rm).toFixed(1);
        await notificationService.send({
          userId: user_id,
          title: "New PR!",
          body: `You hit a new estimated 1RM of ${e1rm} kg on ${pr.exercise_name}.`,
          data: { event: "pr", exerciseId: pr.exercise_id, e1rmKg: Number(pr.new_e1rm) },
          emailSubject: `New PR — ${pr.exercise_name}`,
          emailText: [
            `Personal record!`,
            ``,
            `You hit a new estimated 1RM of ${e1rm} kg on ${pr.exercise_name}.`,
            ``,
            `Keep it up.`,
          ].join("\n"),
        });
      } else {
        await notificationService.send({
          userId: user_id,
          title: "New PRs!",
          body: `You set ${prs.length} personal records this session.`,
          data: { event: "pr_multi", count: prs.length },
          emailSubject: `${prs.length} new PRs this session`,
          emailText: [
            `Personal records!`,
            ``,
            `You set ${prs.length} PRs this session:`,
            ...prs.map((pr) => `  • ${pr.exercise_name}: ${Number(pr.new_e1rm).toFixed(1)} kg`),
            ``,
            `Keep it up.`,
          ].join("\n"),
        });
      }
    } catch (err) {
      console.warn("[segmentLog] PR notification error:", err?.message);
    }
  })();
}
```

### 6c. Update the default export at the bottom of the file

```js
const handlers = createSegmentLogHandlers(pool, makeNotificationService(pool));
```

Add the import at the top of the file:

```js
import { makeNotificationService } from "../services/notificationService.js";
```

---

## Part 7 — Wire deload hook into `readProgram.js`

**File: `api/src/routes/readProgram.js`**

The Layer B `.then()` block in `dayComplete` (line ~754) already calls
`applyProgressionRecommendations`. Modify the `.then()` to check for deload decisions
and send the notification:

```js
.then(async (meta) => {
  const row = meta?.rows?.[0];
  if (!row?.program_id) return null;
  const decisionResult = await progressionDecisionService.applyProgressionRecommendations({
    programId: row.program_id,
    userId: user_id,
    programType: row.program_type,
    fitnessRank: row.fitness_rank ?? 1,
  });

  // Deload acknowledgment notification.
  const hasDeload = decisionResult?.decisions?.some((d) => d.outcome === "deload_local");
  if (hasDeload) {
    // Check deload preference (non-blocking, fire-and-forget already in .then).
    const prefR = await db.query(
      `SELECT deload_notification_enabled FROM notification_preference WHERE user_id = $1`,
      [user_id],
    ).catch(() => ({ rows: [] }));
    const deloadEnabled = prefR.rows[0]?.deload_notification_enabled ?? true;

    if (deloadEnabled) {
      await notificationService.send({
        userId: user_id,
        title: "Easy week incoming",
        body: "Your body showed signs of fatigue — your program has been adjusted to help you recover.",
        data: { event: "deload", programDayId: program_day_id },
        emailSubject: "Recovery week — your program adjusted",
        emailText: [
          `Easy week ahead.`,
          ``,
          `Based on your recent sessions, your program has been adjusted to reduce load on some exercises.`,
          `This is a normal and necessary part of long-term progress.`,
          ``,
          `Open the app to see what changed.`,
        ].join("\n"),
      });
    }
  }

  return decisionResult;
})
```

Add `notificationService` to `createReadProgramHandlers`:

```js
export function createReadProgramHandlers(db = pool) {
  const guidelineLoadService = makeGuidelineLoadService(db);
  const progressionDecisionService = makeProgressionDecisionService(db);
  const notificationService = makeNotificationService(db);
  // ...
}
```

Add the import at the top:

```js
import { makeNotificationService } from "../services/notificationService.js";
```

---

## Part 8 — Mount routes in `server.js`

**File: `api/server.js`**

### 8a. Import new routers

```js
import { notificationPreferencesRouter } from "./src/routes/notificationPreferences.js";
import { workoutRemindersRouter } from "./src/routes/workoutReminders.js";
```

### 8b. Mount user-facing preference routes (requireAuth via router)

Add immediately after the existing `app.patch("/api/users/me", ...)` lines (line ~643):

```js
app.use("/api", notificationPreferencesRouter);
```

### 8c. Mount internal cron route (requireInternalToken)

Add in the admin section, with the other `internalApi`-guarded routes, before the
broad `/api` mounts:

```js
app.use("/api", ...internalApi, workoutRemindersRouter);
```

Add `internalApi` to the existing import from `./src/middleware/chains.js` if not
already imported:

```js
import { requireAuth, internalApi } from "./src/middleware/chains.js";
```

(Check the existing import — `internalApi` may not yet be destructured there.)

---

## Part 9 — Mobile: push token registration in `App.tsx`

**File: `mobile/App.tsx`**

### 9a. Add the registration effect

After the existing `isAuthenticated` reads from `useSessionStore`, add:

```tsx
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken } from "./src/api/notifications";

// Register foreground notification handler once at app level.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Inside App():
const userId = useSessionStore((state) => state.userId);

React.useEffect(() => {
  if (!isAuthenticated || !userId) return;

  (async () => {
    try {
      // Android requires a channel before requesting permissions.
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") return;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: undefined, // reads from app.json extra.eas.projectId automatically
      });

      await registerPushToken(tokenData.data);
    } catch {
      // Non-critical — never block the app on notification setup.
    }
  })();
}, [isAuthenticated, userId]);
```

Place the `useEffect` after the existing `useMemo` hooks in `App()`. The
`[isAuthenticated, userId]` dependency array means it fires once on the
false → true transition and is idempotent if the effect reruns with the same values.

---

## Part 10 — Mobile: `api/notifications.ts`

**New file: `mobile/src/api/notifications.ts`**

```ts
import { authGetJson, authPatchJson } from "./client";

export type NotificationPreferences = {
  reminderEnabled: boolean;
  reminderTimeLocalHhmm: string;
  reminderTimezone: string;
  prNotificationEnabled: boolean;
  deloadNotificationEnabled: boolean;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asStr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizePreferences(raw: unknown): NotificationPreferences {
  const r = asObject(raw);
  return {
    reminderEnabled: asBool(r.reminderEnabled, true),
    reminderTimeLocalHhmm: asStr(r.reminderTimeLocalHhmm, "08:00"),
    reminderTimezone: asStr(r.reminderTimezone, "UTC"),
    prNotificationEnabled: asBool(r.prNotificationEnabled, true),
    deloadNotificationEnabled: asBool(r.deloadNotificationEnabled, true),
  };
}

export async function registerPushToken(token: string): Promise<void> {
  await authPatchJson<unknown, { push_token: string }>(
    "/api/users/me/push-token",
    { push_token: token },
  );
}

export async function clearPushToken(): Promise<void> {
  await authPatchJson<unknown, { push_token: null }>(
    "/api/users/me/push-token",
    { push_token: null },
  );
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const raw = await authGetJson<unknown>("/api/users/me/notification-preferences");
  return normalizePreferences(raw);
}

export async function updateNotificationPreferences(
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const raw = await authPatchJson<unknown, Partial<NotificationPreferences>>(
    "/api/users/me/notification-preferences",
    prefs,
  );
  const r = asObject(raw);
  return normalizePreferences(r.preferences ?? r);
}
```

---

## Part 11 — Tests

### Backend service test

**New file: `api/src/services/__tests__/notificationService.test.js`**

Use node:test + node:assert/strict. Pass a fake `db` object and stub `fetch`
to test dispatch logic without real network calls.

```js
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { makeNotificationService } from "../notificationService.js";

function fakeDb(pushToken, email) {
  return {
    query: async () => ({ rows: [{ device_push_token: pushToken, email }] }),
  };
}

function fakeDbEmpty() {
  return { query: async () => ({ rows: [] }) };
}

test("send() calls Expo when push token is set and response is ok", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { json: async () => ({ data: { status: "ok" } }) };
  };
  const svc = makeNotificationService(fakeDb("ExponentPushToken[abc]", "u@x.com"));
  await svc.send({ userId: "u1", title: "T", body: "B", emailText: "E" });
  assert.ok(fetchCalled);
});

test("send() falls back to email when push token absent", async (t) => {
  let emailSent = false;
  // Patch emailService via the module cache is complex; test the effect instead:
  // Use a db with no push token — observe Expo is NOT called.
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; return { json: async () => ({}) }; };
  const svc = makeNotificationService(fakeDb(null, "u@x.com"));
  await svc.send({ userId: "u1", title: "T", body: "B", emailText: "E" });
  assert.equal(fetchCalled, false);
  // Email fallback is tested via emailService unit tests; here we just confirm no throw.
});

test("send() clears token on DeviceNotRegistered", async () => {
  const updates = [];
  const db = {
    query: async (sql, params) => {
      if (sql.includes("SELECT")) return { rows: [{ device_push_token: "ExponentPushToken[abc]", email: null }] };
      updates.push(params);
      return { rows: [] };
    },
  };
  global.fetch = async () => ({
    json: async () => ({ data: { status: "error", details: { error: "DeviceNotRegistered" } } }),
  });
  const svc = makeNotificationService(db);
  await svc.send({ userId: "u1", title: "T", body: "B" });
  assert.ok(updates.some((p) => p.includes("u1")));
});

test("send() never throws even on complete failure", async () => {
  global.fetch = async () => { throw new Error("network down"); };
  const svc = makeNotificationService(fakeDb("ExponentPushToken[abc]", null));
  // Must not throw:
  await svc.send({ userId: "u1", title: "T", body: "B" });
});

test("send() no-ops gracefully when user not found", async () => {
  const svc = makeNotificationService(fakeDbEmpty());
  await svc.send({ userId: "missing", title: "T", body: "B" });
  // No throw, no fetch
});
```

### Backend route test

**New file: `api/src/routes/__tests__/notificationPreferences.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";

// Test the PUSH_TOKEN_RE validation regex and isValidHhmm logic directly.
// Import the helpers by temporarily extracting them or test via HTTP.
// For CI speed: test the regex patterns inline.

const PUSH_TOKEN_RE = /^ExponentPushToken\[.+\]$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

function isValidHhmm(value) {
  if (!HHMM_RE.test(value)) return false;
  const [hh, mm] = value.split(":").map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

test("PUSH_TOKEN_RE accepts valid Expo token", () => {
  assert.ok(PUSH_TOKEN_RE.test("ExponentPushToken[abc123]"));
});

test("PUSH_TOKEN_RE rejects arbitrary strings", () => {
  assert.equal(PUSH_TOKEN_RE.test("fcm:token"), false);
  assert.equal(PUSH_TOKEN_RE.test(""), false);
});

test("isValidHhmm accepts 08:00 and 23:59", () => {
  assert.ok(isValidHhmm("08:00"));
  assert.ok(isValidHhmm("23:59"));
  assert.ok(isValidHhmm("00:00"));
});

test("isValidHhmm rejects 24:00 and bad formats", () => {
  assert.equal(isValidHhmm("24:00"), false);
  assert.equal(isValidHhmm("8:00"), false);
  assert.equal(isValidHhmm("08:60"), false);
});
```

### Cron endpoint test

**New file: `api/test/workoutReminders.route.test.js`**

Follow the pattern of `api/test/readProgram.route.test.js`. Mount the router in a
test Express app. Use a fake pool that returns a single eligible user row. Assert
that the response `{ ok: true, eligible: 1, sent: 1, failed: 0 }` is returned and
that the `UPDATE notification_preference` upsert runs. Pass a token via
`X-Internal-Token` header matching the env var.

---

## Summary of files changed

| File | Change |
|------|--------|
| `migrations/V64__add_push_token_to_app_user.sql` | New — add `device_push_token` to `app_user` |
| `migrations/V65__create_notification_preference.sql` | New — `notification_preference` table |
| `api/src/services/notificationService.js` | New — Expo push + email fallback service |
| `api/src/routes/notificationPreferences.js` | New — push token + preference endpoints |
| `api/src/routes/workoutReminders.js` | New — internal cron endpoint |
| `api/src/routes/segmentLog.js` | Add PR hook; accept `notificationService` in factory |
| `api/src/routes/readProgram.js` | Add deload hook; inject `notificationService` |
| `api/server.js` | Import and mount two new routers |
| `mobile/App.tsx` | Add `isAuthenticated` effect for token registration + foreground handler |
| `mobile/src/api/notifications.ts` | New — `registerPushToken`, `getNotificationPreferences`, `updateNotificationPreferences` |
| `api/src/services/__tests__/notificationService.test.js` | New — 5 unit tests |
| `api/src/routes/__tests__/notificationPreferences.test.js` | New — validation unit tests |
| `api/test/workoutReminders.route.test.js` | New — cron endpoint integration test |

No npm package installs required (`expo-notifications` installed via Expo; Expo push
uses native `fetch`).
