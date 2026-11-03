import test from "node:test";
import assert from "node:assert/strict";
import { createWorkoutRemindersHandler } from "../src/routes/workoutReminders.js";

const now = () => new Date("2026-07-01T12:00:00Z");
const user = (user_id, overrides = {}) => ({ user_id, created_at: "2020-01-01", timezone: "UTC", ...overrides });
function fixture({ training = [], rest = [], counts = [], send } = {}) {
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
    await createWorkoutRemindersHandler(db, notifier, { now })({ request_id: "test" }, res);
    return res;
  };
  return { queries, messages, run };
}

test("training reminders combine pace and daily copy in one send", async () => {
  const f = fixture({ training: [user("a", { day_label: "Pull", program_day_id: "day" })], counts: [{ user_id: "a", count: 50, recent_count: 1 }] });
  const res = await f.run();
  assert.deepEqual(res.body, { ok: true, eligible: 1, sent: 1, failed: 0, pace_sent: 1 });
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].body, "Your Pull session is ready. Today could be day 51.");
  assert.match(f.messages[0].title, /behind pace/);
  assert.equal(f.messages[0].isPaceMessage, true);
  assert.equal(f.messages[0].isReminder, true);
  assert.deepEqual(f.messages[0].data, { event: "reminder", programDayId: "day" });
  assert.ok(f.messages[0].emailText.includes(f.messages[0].title));
  assert.ok(f.messages[0].emailText.includes(f.messages[0].body));
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
  const f = fixture({ training: [user("a"), user("a"), user("b", { last_reminder_sent_date: "2026-07-01" })],
    counts: [{ user_id: "a", count: 110 }] });
  await f.run();
  assert.equal(f.messages.length, 1);
  for (const q of f.queries.slice(0, 2)) assert.match(q.sql, /COALESCE\(np.reminder_enabled, TRUE\)/);
});

test("local timezone and reminder timezone fallback determine the year and cap", async () => {
  const f = fixture({ training: [user("a", { timezone: "bad", reminder_timezone: "Pacific/Kiritimati", last_reminder_sent_date: "2026-07-01" })],
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
  assert.deepEqual((await f.run()).body, { ok: true, eligible: 0, sent: 0, failed: 0, pace_sent: 0 });
  assert.equal(f.queries.length, 2);
});
