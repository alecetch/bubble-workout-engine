import test from "node:test";
import assert from "node:assert/strict";
import { createWorkoutRemindersHandler } from "../src/routes/workoutReminders.js";

const now = () => new Date("2026-07-01T12:00:00Z");
const user = (user_id, overrides = {}) => ({ user_id, created_at: "2020-01-01", timezone: "UTC", reminder_time_local_hhmm: "08:00", scheduled_date: "2026-07-01", training_dates: [], ...overrides });
function fixture({ training = [], rest = [], counts = [], send, clock = now } = {}) {
  const queries = [], messages = [];
  const db = { async query(sql, params) {
    queries.push({ sql, params });
    if (sql.includes("reminder_training_candidates")) return { rows: training };
    if (sql.includes("reminder_rest_candidates")) return { rows: rest };
    if (sql.includes("reminder_year_counts")) return { rows: counts };
    throw Error("Unexpected query");
  } };
  const notifier = { async send(args) { messages.push(args); return send?.(args); } };
  const run = async () => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await createWorkoutRemindersHandler(db, notifier, { now: clock })({ request_id: "test" }, res);
    return res;
  };
  return { queries, messages, run };
}

test("training reminders combine pace and daily copy in one send", async () => {
  const f = fixture({ training: [user("a", { day_label: "Pull", program_day_id: "day" })], counts: [{ user_id: "a", count: 50, recent_count: 1 }] });
  const res = await f.run();
  assert.deepEqual(res.body, { ok: true, eligible: 1, sent: 1, failed: 0, pace_sent: 1, not_due: 0 });
  assert.equal(f.messages.length, 1);
  assert.equal("emailText" in f.messages[0], false);
  assert.equal("emailSubject" in f.messages[0], false);
  assert.equal(f.messages[0].body, "Your Pull session is ready. Today could be day 51.");
  assert.equal(f.messages[0].title, "Every session counts");
  assert.equal(f.messages[0].isPaceMessage, true);
  assert.equal(f.messages[0].isReminder, true);
  assert.deepEqual(f.messages[0].data, { event: "reminder", programDayId: "day" });
});

test("rest nudges only behind users and counts are batched across both passes", async () => {
  const f = fixture({ training: [user("a")], rest: [user("b"), user("c")], counts: [
    { user_id: "a", count: 110 }, { user_id: "b", count: 40 }, { user_id: "c", count: 120 },
  ] });
  const res = await f.run();
  assert.equal(res.body.pace_sent, 1);
  assert.deepEqual(f.messages.map(m => m.userId), ["b", "a"]);
  assert.deepEqual(f.messages[0].data, { event: "pace_nudge" });
  assert.equal(f.queries.filter(q => q.sql.includes("reminder_year_counts")).length, 1);
  assert.equal(f.queries.length, 3);
  assert.deepEqual(new Set(f.queries[2].params[0]), new Set(["a", "b", "c"]));
});

test("weekly cap blocks rest nudges but permits ordinary training reminders", async () => {
  const f = fixture({ training: [user("a", { last_pace_message_sent_on: "2026-06-25" })],
    rest: [user("b", { last_pace_message_sent_on: "2026-06-25" }), user("c", { last_pace_message_sent_on: "2026-06-24" })],
    counts: ["a", "b", "c"].map(user_id => ({ user_id, count: 20 })) });
  const res = await f.run();
  assert.equal(res.body.sent, 2);
  assert.equal(res.body.pace_sent, 1);
  assert.equal(f.messages.find(m => m.userId === "a").title, "Time to train");
  assert.equal(f.messages.some(m => m.userId === "b"), false);
});

test("daily cap and duplicate scheduled days cannot send twice", async () => {
  const f = fixture({ training: [user("a"), user("a"), user("b", { last_reminder_sent_date: "2026-07-01", scheduled_date: "2026-07-02", reminder_time_local_hhmm: "01:00" })],
    counts: [{ user_id: "a", count: 110 }] });
  await f.run();
  assert.equal(f.messages.length, 1);
  for (const q of f.queries.slice(0, 2)) assert.match(q.sql, /COALESCE\(np.reminder_enabled, TRUE\)/);
});

test("local timezone and reminder timezone fallback determine the year and cap", async () => {
  const f = fixture({ training: [user("a", { timezone: "bad", reminder_timezone: "Pacific/Kiritimati", last_reminder_sent_date: "2026-07-01", scheduled_date: "2026-07-02", reminder_time_local_hhmm: "01:00" })],
    counts: [{ user_id: "a", count: 120 }] });
  await f.run();
  assert.equal(f.messages.length, 1); // Already 2 July locally.
  assert.equal(f.queries[2].params[3][0], "2026-07-02");
});

test("unknown counts retain old reminder body and delivery failures are reported", async () => {
  const f = fixture({ training: [user("a")], send: () => { throw Error("delivery"); } });
  const res = await f.run();
  assert.equal(f.messages[0].body, "Your workout session is ready. Get it done.");
  assert.equal(res.body.failed, 1);
});

test("a concurrent daily reservation is skipped without inflating sent", async () => {
  const f = fixture({ training: [user("a")], send: () => ({ sent: false, reason: "capped_or_disabled" }) });
  assert.equal((await f.run()).body.sent, 0);
});

test("empty eligibility needs no training-session query", async () => {
  const f = fixture();
  assert.deepEqual((await f.run()).body, { ok: true, eligible: 0, sent: 0, failed: 0, pace_sent: 0, not_due: 0 });
  assert.equal(f.queries.length, 2);
});

test("time gate skips until due and catches up later", async () => {
  const options = { training: [user("a", { reminder_time_local_hhmm: "13:00" })] };
  const early = fixture(options); assert.equal((await early.run()).body.not_due, 1); assert.equal(early.messages.length, 0);
  assert.equal(early.queries.length, 2);
  const late = fixture({ ...options, clock: () => new Date("2026-07-01T13:05Z") });
  assert.equal((await late.run()).body.sent, 1);
});

test("training rows must match local date and the first matching row wins", async () => {
  const f = fixture({ clock: () => new Date("2026-07-01T22:30Z"), training: [
    user("a", { timezone: "Australia/Sydney", scheduled_date: "2026-07-01", program_day_id: "wrong" }),
    user("a", { timezone: "Australia/Sydney", scheduled_date: "2026-07-02", program_day_id: "right" }),
    user("a", { timezone: "Australia/Sydney", scheduled_date: "2026-07-02", program_day_id: "duplicate" }),
  ] });
  await f.run(); assert.equal(f.messages.length, 1); assert.equal(f.messages[0].data.programDayId, "right");
  const wrongOnly = fixture({ clock: () => new Date("2026-07-01T22:30Z"), training: [user("a", { timezone: "Australia/Sydney" })] });
  assert.equal((await wrongOnly.run()).body.sent, 0);
});

test("rest candidates exclude their local training dates, including completed days", async () => {
  const f = fixture({ clock: () => new Date("2026-07-01T22:30Z"), rest: [
    user("a", { timezone: "Australia/Sydney", training_dates: ["2026-07-02"] }),
    user("b", { timezone: "Australia/Sydney", training_dates: ["2026-07-01"] }),
  ], counts: [{ user_id: "a", count: 1 }, { user_id: "b", count: 1 }] });
  await f.run(); assert.deepEqual(f.messages.map(m => m.userId), ["b"]); assert.deepEqual(f.messages[0].data, { event: "pace_nudge" });
});

test("candidate queries select push only and widen dates around server day", async () => {
  const f = fixture(); await f.run();
  for (const { sql } of f.queries) {
    assert.match(sql, /au.device_push_token IS NOT NULL/); assert.doesNotMatch(sql, /OR au.email/);
    assert.match(sql, /BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE \+ 1/);
  }
});

for (const trainingDay of [false, true]) test(`${trainingDay ? "workout" : "rest"}-day user 100 behind receives distinct forgiving copy`, async () => {
  // 1 July expects 100 training days in the full-year 200-day window.
  const candidate = user("a", { day_label: "Pull", program_day_id: "day" });
  const f = fixture({ [trainingDay ? "training" : "rest"]: [candidate], counts: [{ user_id: "a", count: 0 }] });
  const response = await f.run();
  assert.equal(response.body.sent, 1); assert.equal(response.body.pace_sent, 1);
  assert.equal(f.messages.length, 1);
  const message = f.messages[0];
  assert.equal(message.title, "Every session counts");
  assert.equal(message.body, trainingDay ? "Your Pull session is ready. Today could be day 1." : "Today could be day 1 of your year.");
  assert.notEqual(message.title, message.body); assert.doesNotMatch(message.body, /behind|100/);
  assert.equal(message.isPaceMessage, true);
  assert.deepEqual(message.data, trainingDay ? { event: "reminder", programDayId: "day" } : { event: "pace_nudge" });
});
test("rest-day user three behind retains the week catch-up sentence", async () => {
  const f = fixture({ rest: [user("a")], counts: [{ user_id: "a", count: 97 }] });
  assert.equal((await f.run()).body.sent, 1); assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].title, "Catch up this week");
  assert.equal(f.messages[0].body, "You're 3 behind pace. Three extra sessions this week and you're back.");
  assert.deepEqual(f.messages[0].data, { event: "pace_nudge" });
});
