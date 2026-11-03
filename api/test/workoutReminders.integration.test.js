import test, { after } from "node:test";
import assert from "node:assert/strict";
import { DATABASE_SKIP, withUsers, withApp, closeDb } from "../testSupport/entitlementFixtures.js";
import { trainingProgram } from "../testSupport/trainingFixtures.js";
import { createWorkoutRemindersHandler } from "../src/routes/workoutReminders.js";
import { makeNotificationService } from "../src/services/notificationService.js";
import { requireInternalToken } from "../src/middleware/auth.js";

after(closeDb);
const now = () => new Date("2026-07-01T12:00:00Z");
const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

// Exercise the production SQL while keeping this global job isolated to its fixture users.
function scopedDatabase(db, ids) {
  return { query(sql, params) {
    if (sql.includes("reminder_training_candidates")) {
      return db.query(sql.replace("AND COALESCE", "AND au.id = ANY($1::uuid[]) AND COALESCE"), [ids]);
    }
    if (sql.includes("reminder_rest_candidates")) {
      return db.query(sql.replace("WHERE COALESCE", "WHERE au.id = ANY($1::uuid[]) AND COALESCE"), [ids]);
    }
    return db.query(sql, params);
  } };
}

async function setup(db, ids) {
  await db.query("UPDATE app_user SET created_at = '2020-01-01', timezone = 'UTC', device_push_token = 'test' WHERE id = ANY($1::uuid[])", [ids]);
  const programs = [];
  for (const id of ids) {
    const p = await trainingProgram(db, id);
    await db.query("UPDATE program SET status = 'active' WHERE id = $1", [p.id]);
    programs.push(p);
  }
  return programs;
}

test("real reminder SQL combines once, stamps both dates, and suppresses repeats", { skip: DATABASE_SKIP }, async t => {
  const messages = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return { json: async () => ({ data: { status: "ok" } }) };
  });
  await withUsers(async (db, ids) => {
    const [p] = await setup(db, ids);
    await db.query(`INSERT INTO program_calendar_day (program_id, user_id, program_week_id, week_number,
      scheduled_offset_days, scheduled_weekday, scheduled_date, global_day_index, program_day_key, is_training_day, program_day_id)
      SELECT program_id, $2, program_week_id, 1, 0, 'mon', CURRENT_DATE, 1, program_day_key, TRUE, id
      FROM program_day WHERE id = $1`, [p.days[0], ids[0]]);
    await db.query(`INSERT INTO training_session (user_id, local_date, source)
      VALUES ($1, '2026-01-01', 'apple_health'), ($1, '2026-01-01', 'apple_health')`, [ids[0]]);
    // The other active program is a rest day. It is ahead and should hear nothing.
    await db.query(`INSERT INTO training_session (user_id, local_date, source)
      SELECT $1, '2026-01-01'::date + n, 'apple_health' FROM generate_series(0,119) n`, [ids[1]]);
    const handler = createWorkoutRemindersHandler(scopedDatabase(db, ids), makeNotificationService(db, { now }), { now });
    const first = res();
    await handler({}, first);
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.body, { ok: true, eligible: 1, sent: 1, failed: 0, pace_sent: 1 });
    assert.equal(messages.length, 1);
    assert.match(messages[0].body, /Today could be day 2/);
    const dates = (await db.query(`SELECT last_reminder_sent_date::text, last_pace_message_sent_on::text
      FROM notification_preference WHERE user_id = $1`, [ids[0]])).rows[0];
    assert.deepEqual(dates, { last_reminder_sent_date: "2026-07-01", last_pace_message_sent_on: "2026-07-01" });
    await handler({}, res());
    assert.equal(messages.length, 1);
  });
});

test("rest nudges respect disabled reminders and the seven-day boundary", { skip: DATABASE_SKIP }, async t => {
  const messages = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => { messages.push(JSON.parse(options.body)); return { json: async () => ({ data: { status: "ok" } }) }; });
  await withUsers(async (db, ids) => {
    await setup(db, ids);
    await db.query("INSERT INTO notification_preference (user_id, reminder_enabled) VALUES ($1, FALSE)", [ids[1]]);
    let instant = now();
    const clock = { now: () => instant };
    const handler = createWorkoutRemindersHandler(scopedDatabase(db, ids), makeNotificationService(db, clock), clock);
    const first = res();
    await handler({}, first);
    assert.equal(first.body.pace_sent, 1);
    assert.deepEqual(messages[0].data, { event: "pace_nudge" });
    instant = new Date("2026-07-07T12:00Z");
    await handler({}, res());
    assert.equal(messages.length, 1);
    instant = new Date("2026-07-08T12:00Z");
    await handler({}, res());
    assert.equal(messages.length, 2);
  });
});

test("all notification kinds share an atomic daily reservation", { skip: DATABASE_SKIP }, async t => {
  let pushes = 0;
  t.mock.method(globalThis, "fetch", async () => { pushes++; return { json: async () => ({ data: { status: "ok" } }) }; });
  await withUsers(async (db, [user]) => {
    await db.query("UPDATE app_user SET timezone = 'Pacific/Kiritimati', device_push_token = 'test' WHERE id = $1", [user]);
    const service = makeNotificationService(db, { now });
    const results = await Promise.all([
      service.send({ userId: user, title: "PR", body: "PR", data: { event: "pr" } }),
      service.send({ userId: user, title: "Nudge", body: "Nudge", isReminder: true, isPaceMessage: true }),
    ]);
    assert.equal(pushes, 1);
    assert.equal(results.filter(r => r.sent).length, 1);
    assert.equal((await db.query("SELECT last_reminder_sent_date::text FROM notification_preference WHERE user_id = $1", [user])).rows[0].last_reminder_sent_date, "2026-07-02");
  });
});

test("internal reminder route rejects absent/incorrect tokens", { skip: DATABASE_SKIP }, async () => {
  const original = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "pace-reminder-test-token";
  try {
    await withApp(app => app.post("/reminders", requireInternalToken, (_req, res) => res.json({ ok: true })), async url => {
      for (const headers of [{}, { "x-internal-token": "wrong" }]) assert.equal((await fetch(`${url}/reminders`, { method: "POST", headers })).status, 401);
      assert.equal((await fetch(`${url}/reminders`, { method: "POST", headers: { "x-internal-token": process.env.INTERNAL_API_TOKEN } })).status, 200);
    });
  } finally { if (original === undefined) delete process.env.INTERNAL_API_TOKEN; else process.env.INTERNAL_API_TOKEN = original; }
});
