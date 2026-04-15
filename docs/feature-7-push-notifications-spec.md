# Feature 7 Specification: Push Notifications and Engagement Hooks

---

## 1. Executive Summary

Feature 7 closes the passive retention gap. The engine knows when each athlete is
scheduled to train, when a PR is hit, and when Layer B decides a deload is needed.
None of those events currently reach the user outside the app. This feature adds
three notification event types — workout reminders, PR celebrations, and deload
acknowledgments — delivered via Expo push notifications with an email fallback
through the existing `emailService.js` abstraction.

The implementation splits cleanly across three concerns:

1. **Infrastructure** — push token storage, a notification dispatch service, and a
   daily Fly.io scheduled task for reminders.
2. **Event hooks** — three fire-and-forget side effects wired into existing handlers
   where the triggering events already occur.
3. **Mobile registration** — Expo Notifications permission request + token
   registration on first app open.

No new engine logic. No new data model beyond two columns and one table.

---

## 2. Product Goals

### Primary goals

1. Increase session completion rate through timely workout reminders.
2. Reinforce the adaptation flywheel by celebrating PRs immediately after they happen.
3. Extend the adaptation transparency narrative (Feature 6) through deload
   acknowledgment delivered at the moment Layer B decides to reduce load.
4. Degrade gracefully — every push notification falls back to email, and every email
   falls back to a console log in dev.

### Non-goals

1. Not a full notification centre / inbox within the app.
2. Not marketing or re-engagement messages (no "You haven't trained in 3 days").
3. Not real-time messaging or WebSocket-based notifications.
4. Not user-configurable quiet hours (out of scope for Phase 1; can be added later by
   adding a `notification_quiet_hours_json` column).
5. Not APNs/FCM direct integration — Expo handles the provider routing.

---

## 3. Current-State Analysis

### What exists today

| Asset | Location | Relevance |
|-------|----------|-----------|
| Email abstraction | `api/src/services/emailService.js` | `sendEmail({ to, subject, text, html })` — supports console/SMTP/Resend; the fallback for all notification events |
| `app_user` table | `migrations/V3__create_app_user.sql` | Has `id`, `email`, `password_hash`; no push token column yet |
| `program_calendar_day` table | `api/src/services/calendarCoverage.js` | Already populated for every program; columns: `scheduled_date`, `is_training_day`, `program_day_id`, `user_id` (via join to `program`) |
| `program_day.is_completed` | `api/src/routes/readProgram.js:738` | Set by `PATCH /api/day/:id/complete`; Layer B already fires here |
| PR detection logic | `api/src/routes/prsFeed.js:70` | SQL CTE pattern that identifies new PRs by comparing `weight_kg` to `prev_best_kg`; can be ported inline to the segment log handler |
| `POST /api/segment-log` | `api/src/routes/segmentLog.js:95` | Where `estimated_1rm_kg` is written per set; the PR hook fires here |
| `dayComplete` | `api/src/routes/readProgram.js:708` | Already fires Layer B non-blocking; the deload acknowledgment hook fires from Layer B's results here |
| `exercise_progression_decision.decision_outcome` | V60 migration | `"deload_local"` rows written by Layer B; the hook reads these |

### What is missing

- `device_push_token` column on `app_user`.
- `notification_preference` table (reminder time, opt-in flags per event type).
- A `notificationService.js` that wraps Expo push dispatch + email fallback.
- A daily scheduled task (Fly.io cron machine) for workout reminders.
- Mobile: Expo Notifications permission request and token registration on first open.

---

## 4. Data Model

### Migration V64 — add push token to `app_user`

```sql
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS device_push_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS device_push_token_updated_at TIMESTAMPTZ NULL;
```

One token per user. If a user has multiple devices, the most recently registered
token wins (last-write-wins via `PATCH /api/users/me/push-token`). Multi-device
fan-out is out of scope for Phase 1.

### Migration V65 — notification preferences

```sql
CREATE TABLE IF NOT EXISTS notification_preference (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reminder_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_time_local_hhmm   TEXT NOT NULL DEFAULT '08:00',  -- '08:00', '07:30', etc.
  reminder_timezone          TEXT NOT NULL DEFAULT 'UTC',
  pr_notification_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  deload_notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
```

Row is created lazily on first call to `PATCH /api/users/me/notification-preferences`
or during push token registration if a preference row doesn't exist. Defaults encode
the intended out-of-box behaviour (all on, 8am reminders).

---

## 5. Backend — Notification Service

**New file: `api/src/services/notificationService.js`**

### Responsibilities

1. Send an Expo push notification to a device token (with structured payload).
2. Fall back to `emailService.sendEmail` if no push token, or if the Expo API
   returns a non-retriable error.
3. Never throw — all errors are logged and swallowed, matching the fire-and-forget
   contract of the callers.

### Expo Push API

Expo provides a simple HTTP endpoint for sending push notifications without
managing APNs/FCM credentials directly. No npm package required — plain `fetch`.

```
POST https://exp.host/--/api/v2/push/send
Content-Type: application/json

{
  "to": "<ExponentPushToken[...]>",
  "title": "...",
  "body": "...",
  "data": { ... },
  "sound": "default",
  "badge": 1
}
```

Response: `{ data: { status: "ok" | "error", message?: string, details?: { error: string } } }`

Non-retriable errors from Expo: `"DeviceNotRegistered"`, `"InvalidCredentials"`,
`"MessageTooBig"`, `"MessageRateExceeded"`. On `"DeviceNotRegistered"`, clear the
stored token.

### Service API

```js
export function makeNotificationService(db) {
  /**
   * Send a notification. Tries push first; falls back to email.
   * @param {object} opts
   * @param {string} opts.userId
   * @param {string} opts.title
   * @param {string} opts.body
   * @param {object} [opts.data]      — custom payload passed to the app
   * @param {string} [opts.emailSubject]
   * @param {string} [opts.emailText]
   * @param {string} [opts.emailHtml]
   */
  async function send({ userId, title, body, data, emailSubject, emailText, emailHtml }) { ... }

  return { send };
}
```

### Internal dispatch logic

```
1. Fetch user row: SELECT device_push_token, email FROM app_user WHERE id = $userId
2. If device_push_token is set:
   a. POST to https://exp.host/--/api/v2/push/send
   b. If response status = "ok" → done
   c. If response details.error = "DeviceNotRegistered":
      → UPDATE app_user SET device_push_token = NULL WHERE id = $userId
      → fall through to email
   d. On any other error → log warn, fall through to email
3. If email is set AND emailText is provided:
   → sendEmail({ to: email, subject: emailSubject ?? title, text: emailText, html: emailHtml })
4. If neither → log warn "No notification channel available for userId"
```

All errors at every step are caught and logged; the function must never propagate
exceptions to callers.

---

## 6. Backend — New API Endpoints

### 6.1 `PATCH /api/users/me/push-token`

**Purpose:** Register or update the Expo push token for the authenticated user.

**Auth:** `requireAuth` middleware (same as all other `/api/users/me` routes).

**Request body:**

```jsonc
{
  "push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"   // or null to clear
}
```

**Behaviour:**

1. Validate `push_token`: if present, must match `/^ExponentPushToken\[.+\]$/`.
   Accept `null` to clear the stored token.
2. Upsert on `app_user`:
   ```sql
   UPDATE app_user
   SET device_push_token = $2,
       device_push_token_updated_at = now()
   WHERE id = $1
   ```
3. If no `notification_preference` row exists for this user, INSERT one with defaults.
4. Return `{ ok: true }`.

**Error cases:** 400 if `push_token` is present but fails regex; 401 if unauthenticated.

---

### 6.2 `GET /api/users/me/notification-preferences`

Returns the current notification preferences for the authenticated user.

**Response:**

```jsonc
{
  "reminderEnabled": true,
  "reminderTimeLocalHhmm": "08:00",
  "reminderTimezone": "Europe/London",
  "prNotificationEnabled": true,
  "deloadNotificationEnabled": true
}
```

Returns defaults (as if a row existed) if no preference row exists yet.

---

### 6.3 `PATCH /api/users/me/notification-preferences`

Upserts the notification preference row. All fields are optional; only provided
fields are updated.

**Request body:**

```jsonc
{
  "reminderEnabled": false,
  "reminderTimeLocalHhmm": "07:00",
  "reminderTimezone": "America/New_York",
  "prNotificationEnabled": true,
  "deloadNotificationEnabled": false
}
```

**Validation:**

- `reminderTimeLocalHhmm`: must match `/^\d{2}:\d{2}$/` and parse to a valid
  24-hour time (00:00–23:59).
- `reminderTimezone`: must be a valid IANA timezone string. Validate by attempting
  `Intl.DateTimeFormat` construction and catching exceptions.

**Response:** `{ ok: true, preferences: { ... } }` — the full updated preference object.

---

## 7. Event Hook 1 — PR Notification

### Where it fires

`postSegmentLog` in `api/src/routes/segmentLog.js`, after the transaction COMMIT.

### Trigger condition

After the `COMMIT`, for each row where `estimated_1rm_kg` was written, check if it
exceeds the user's all-time best `estimated_1rm_kg` for that `exercise_id`. A PR is
detected when `new_value > prev_best`, where `prev_best` excludes the just-inserted
rows.

### Implementation

Fire-and-forget after `client.release()`. The check is a single aggregation query.

```js
// Non-blocking — fires after response is sent.
(async () => {
  try {
    const exerciseIds = [...new Set(rows.map((r) => r.program_exercise_id))];
    const prResult = await db.query(
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

    for (const pr of prResult.rows) {
      const e1rmFormatted = Number(pr.new_e1rm).toFixed(1);
      await notificationService.send({
        userId: user_id,
        title: "New PR!",
        body: `You hit a new estimated 1RM of ${e1rmFormatted} kg on ${pr.exercise_name}.`,
        data: { event: "pr", exerciseId: pr.exercise_id, e1rmKg: pr.new_e1rm },
        emailSubject: `New PR — ${pr.exercise_name}`,
        emailText: [
          `Personal record!`,
          ``,
          `You hit a new estimated 1RM of ${e1rmFormatted} kg on ${pr.exercise_name}.`,
          ``,
          `Keep it up.`,
        ].join("\n"),
      });
    }
  } catch (err) {
    req.log?.warn({ event: "notification.pr.error", err: err?.message }, "PR notification failed");
  }
})();
```

`notificationService` is injected into `createSegmentLogHandlers(db, notificationService)`.

### Guard: `prNotificationEnabled`

Before sending, check the user's preference: if `pr_notification_enabled = false`,
skip. Include the preference check in the non-blocking block (a single DB read
co-located with the PR detection query).

---

## 8. Event Hook 2 — Deload Acknowledgment

### Where it fires

`dayComplete` in `api/src/routes/readProgram.js`, inside the existing Layer B
fire-and-forget `.then()` block, after `applyProgressionRecommendations` resolves.

### Trigger condition

`applyProgressionRecommendations` returns `{ decisions, updated }`. If any decision
has `outcome === "deload_local"`, send one deload acknowledgment notification.
Only one notification per day completion event regardless of how many exercises
deloaded.

### Implementation

Modify the existing `.then()` chain:

```js
.then(async (result) => {
  const row = meta?.rows?.[0];
  if (!row?.program_id) return null;
  const decisionResult = await progressionDecisionService.applyProgressionRecommendations({ ... });

  const hasDeload = decisionResult?.decisions?.some((d) => d.outcome === "deload_local");
  if (hasDeload) {
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

  return decisionResult;
})
```

`notificationService` is passed into `createReadProgramHandlers(db, notificationService)`.

### Guard: `deloadNotificationEnabled`

`notificationService.send` handles preference checking internally — pass the
`userId` and let the service read the preference. This keeps the caller clean.

Alternatively: check `deload_notification_enabled` inline before calling `send`.
Prefer inline check so the send call itself is unconditional (simpler service
contract).

---

## 9. Event Hook 3 — Workout Reminder (Daily Cron)

### Architecture

A **Fly.io scheduled machine** (cron job) runs daily at a server-side time chosen
to cover the most common reminder windows (e.g. 06:30 UTC, which is 07:30 BST /
08:30 CEST). It calls an internal admin-only API endpoint `POST /api/internal/send-workout-reminders`.

An alternative is a single server-side `setInterval` or `node-cron` call inside
`server.js`. The Fly.io machine approach is preferred because:
- It does not tie reminder delivery to server uptime / restarts.
- It is observable via `fly machine logs`.
- It follows the same pattern as other scheduled infra tasks in the stack.

### Internal endpoint

```
POST /api/internal/send-workout-reminders
Authorization: Bearer <INTERNAL_API_TOKEN>
```

The `INTERNAL_API_TOKEN` is a Fly.io secret (different from `ADMIN_API_KEY` to
maintain separation of concerns). The endpoint is not exposed under `/admin` and
is not behind the admin panel token.

### Reminder query

Find all users who:
1. Have a training day scheduled on today's date (`program_calendar_day.is_training_day = TRUE`).
2. Have `reminder_enabled = TRUE` in their `notification_preference`.
3. Have either a `device_push_token` OR an `email` on `app_user`.
4. Have not already completed the day (`program_day.is_completed = FALSE`).

```sql
SELECT
  au.id            AS user_id,
  au.device_push_token,
  au.email,
  np.reminder_time_local_hhmm,
  np.reminder_timezone,
  pd.day_label,
  pd.day_type
FROM program_calendar_day pcd
JOIN program p ON p.id = pcd.program_id
JOIN app_user au ON au.id = p.user_id
LEFT JOIN notification_preference np ON np.user_id = au.id
LEFT JOIN program_day pd ON pd.id = pcd.program_day_id
WHERE pcd.scheduled_date = CURRENT_DATE
  AND pcd.is_training_day = TRUE
  AND pd.is_completed = FALSE
  AND (np.reminder_enabled IS NULL OR np.reminder_enabled = TRUE)
  AND (au.device_push_token IS NOT NULL OR au.email IS NOT NULL)
ORDER BY au.id;
```

### Timezone-aware filtering (Phase 2 enhancement)

Phase 1: all reminders fire at the single scheduled time; `reminder_time_local_hhmm`
is stored but not yet enforced. The cron runs once at 06:30 UTC and sends to all
eligible users. This is accurate enough for athletes in UTC±2 (the expected initial
user base).

Phase 2: run the cron every 30 minutes, filter users where `now()` in their local
timezone is within a 30-minute window of their `reminder_time_local_hhmm`. This
requires PostgreSQL's `AT TIME ZONE` operator with the stored `reminder_timezone`.

### Notification content

```
Title: "Time to train"
Body:  "Your {day_label} session is ready. Get it done."
Data:  { event: "reminder", programDayId: <uuid> }
```

Email fallback subject: `"Your {day_label} workout is ready"`

If `day_label` is null (old programs without labels), use `"workout"`.

### Deduplication

Track sent reminders in a lightweight in-memory `Set<userId>` per cron invocation.
No persistent dedup table needed for Phase 1 — the query already filters
`is_completed = FALSE`, so a re-run within the same day will send again only if the
day hasn't been completed. This is acceptable.

---

## 10. Mobile — Push Token Registration

**File: `mobile/src/screens/onboarding/OnboardingEntry.tsx`** (or equivalent app entry
point that runs on every fresh launch).

### Flow

1. On mount, call `Expo.Notifications.requestPermissionsAsync()`.
2. If `granted`, call `Expo.Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })`.
3. POST the token to `PATCH /api/users/me/push-token` with the authenticated user's
   token.
4. Store the result in session state so the app doesn't re-register on every launch
   unless the token changes.

### Implementation notes

- `EAS_PROJECT_ID` comes from `app.json` / `app.config.js` (`extra.eas.projectId`).
- Registration is non-blocking — never delay the onboarding flow for it.
- On Android, a notification channel must be created before requesting permissions:
  ```ts
  Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
  ```
- If `status !== "granted"` (iOS: declined, Android: not available), skip silently.
  Do not show an in-app permission explanation dialog for Phase 1.
- `expo-notifications` must be installed: `npx expo install expo-notifications`.

### New API function in `mobile/src/api/`

```ts
// mobile/src/api/notifications.ts

export async function registerPushToken(token: string): Promise<void> {
  await authPatchJson<unknown, { push_token: string }>(
    "/api/users/me/push-token",
    { push_token: token },
  );
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> { ... }

export async function updateNotificationPreferences(
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> { ... }

export type NotificationPreferences = {
  reminderEnabled: boolean;
  reminderTimeLocalHhmm: string;
  reminderTimezone: string;
  prNotificationEnabled: boolean;
  deloadNotificationEnabled: boolean;
};
```

### Foreground notification handler

Register a foreground handler so notifications received while the app is open are
displayed (iOS suppresses them by default):

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

Register this at the root of the app (e.g. `App.tsx` or `AppNavigator`).

---

## 11. Notification Content Reference

| Event | Title | Body | Data payload |
|-------|-------|------|-------------|
| Workout reminder | `"Time to train"` | `"Your {day_label} session is ready. Get it done."` | `{ event: "reminder", programDayId }` |
| PR — single | `"New PR!"` | `"You hit a new estimated 1RM of {X} kg on {exercise_name}."` | `{ event: "pr", exerciseId, e1rmKg }` |
| PR — multiple (same session) | `"New PRs!"` | `"You set {N} personal records this session."` | `{ event: "pr_multi", count: N }` |
| Deload acknowledgment | `"Easy week incoming"` | `"Your body showed signs of fatigue — your program has been adjusted to help you recover."` | `{ event: "deload", programDayId }` |

**Multiple PRs in one session:** If `prResult.rows.length > 1`, send a single
aggregated notification rather than one per exercise. The `data.count` field lets
the app navigate to the PRs feed on tap.

**Deep link on tap:** The mobile app should register a notification response
handler (`Notifications.addNotificationResponseReceivedListener`) and navigate based
on `data.event`:
- `"reminder"` → `ProgramDay` screen for `data.programDayId`
- `"pr"` / `"pr_multi"` → Personal Records screen
- `"deload"` → current day's program day

---

## 12. Implementation Phases

### Phase 1 — Infrastructure and PR hook

1. Migrations V64 and V65.
2. `notificationService.js` with Expo push + email fallback.
3. `PATCH /api/users/me/push-token` endpoint.
4. PR notification hook in `postSegmentLog`.
5. Mobile: `expo-notifications` install + token registration flow.

**Deliverable:** Athletes with push tokens receive a PR notification immediately after
logging a set that beats their best estimated 1RM.

### Phase 2 — Deload acknowledgment

6. Wire deload hook into `dayComplete` Layer B `.then()`.
7. `GET` + `PATCH /api/users/me/notification-preferences` endpoints.

**Deliverable:** Athletes receive "Easy week incoming" when Layer B deloads an exercise.

### Phase 3 — Workout reminders

8. `POST /api/internal/send-workout-reminders` endpoint.
9. Fly.io scheduled machine (or `fly machine run --schedule daily`).
10. Mobile: foreground notification handler + deep link navigation.

**Deliverable:** Athletes receive a daily reminder at 8am (fixed time, Phase 1) on days
they have a training session scheduled and not yet completed.

### Phase 4 — Preference UI and timezone-aware reminders (future)

11. Settings screen in mobile with notification preference toggles and time picker.
12. Per-user timezone detection and storage.
13. Cron runs every 30 minutes; filter users by local time window.

---

## 13. Dependencies

| Dependency | Status | Impact if absent |
|-----------|--------|-----------------|
| `emailService.js` | **Shipped** | Email fallback always available |
| Layer B trigger in `dayComplete` | **Shipped** (Feature 1) | Deload hook fires from existing `.then()` — no additional wiring needed |
| `exercise_progression_decision` (V60) | **Shipped** | PR and deload detection use existing rows |
| Expo Notifications SDK | **Not installed** | Phase 1 mobile work blocked until `expo install expo-notifications` |
| Fly.io scheduled machine | **Not provisioned** | Phase 3 reminder delivery blocked; can substitute with `node-cron` inside `server.js` |
| `INTERNAL_API_TOKEN` Fly secret | **Not set** | Phase 3 cron endpoint unprotected until set |

Feature 7 Phase 1 (PR notifications) is unblocked. The only required prerequisite is
`expo-notifications` on the mobile side and the two new migrations.

---

## 14. Testing

### Backend unit tests

**File: `api/src/services/__tests__/notificationService.test.js`**

| Test | What it validates |
|------|-----------------|
| `send` dispatches to Expo when `device_push_token` is set | Push path happy |
| `send` calls `sendEmail` when push token is absent and email is set | Email fallback |
| `send` clears token and falls back to email on `DeviceNotRegistered` | Token invalidation |
| `send` never throws on Expo API error | Error isolation |
| `send` never throws when neither channel is available | Graceful no-op |

**File: `api/src/routes/__tests__/pushToken.test.js`**

| Test | What it validates |
|------|-----------------|
| `PATCH /api/users/me/push-token` stores valid token | Happy path |
| `PATCH /api/users/me/push-token` rejects malformed token | Validation |
| `PATCH /api/users/me/push-token` clears token when `null` | Token clearing |
| `PATCH /api/users/me/push-token` creates preference row if absent | Side effect |

**File: `api/src/routes/__tests__/workoutReminder.test.js`**

| Test | What it validates |
|------|-----------------|
| Internal endpoint returns 401 without token | Auth guard |
| Reminder query returns only is_training_day=TRUE rows | Eligibility filter |
| Reminder query excludes completed days | Completion guard |
| Reminder query excludes users with reminder_enabled=FALSE | Preference respect |

### Integration test

Seed: a user with `device_push_token` set, an active program with today as a training
day, and a completed set that sets a new `estimated_1rm_kg` record. Call
`POST /api/segment-log` and assert that the notification service `send` was invoked
with `event: "pr"`.

Use a test-double for `notificationService` injected via the factory pattern; do not
call Expo's API in tests.

---

## 15. Security Notes

- The internal reminder endpoint (`/api/internal/send-workout-reminders`) must be
  protected by `INTERNAL_API_TOKEN`, checked as a bearer token before any DB access.
  This token must never be exposed in client-side code.
- `device_push_token` is a user-identifying value — it must only be readable/writable
  by the owning user (enforced by the `requireAuth` middleware and `WHERE id = $user_id`
  scoping in all queries).
- The Expo push token format regex `/^ExponentPushToken\[.+\]$/` validates the token
  on registration; do not store arbitrary strings in the `device_push_token` column.
- Email addresses must not be included in push notification `data` payloads.

---

## 16. Out of Scope

- **Simulator push testing** — Expo push tokens do not work on iOS Simulator; test
  with physical devices or Expo Go.
- **Multi-device fan-out** — only the most recently registered token is used.
- **Notification inbox / read tracking** — no server-side record of sent notifications.
- **Marketing or re-engagement messages** — "You haven't trained in 3 days" is out of
  scope and would require separate GDPR/consent handling.
- **Background fetch / silent push** — not needed for this feature; all notifications
  are user-visible.
- **Android notification channels beyond "default"** — one channel is sufficient for
  Phase 1.
