import assert from "node:assert/strict";
import test from "node:test";
import { sendPredictorEmail } from "../hyroxPredictorEmailService.js";

function db() {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  };
}

test("sendPredictorEmail sends content and marks the log sent", async () => {
  const database = db();
  const sends = [];
  const result = await sendPredictorEmail(
    { id: "sub-1", email: "alex@example.com" },
    { subject: "Subject", html: "<p>Hello</p>", text: "Hello" },
    database,
    console,
    "log-1",
    async (payload) => sends.push(payload),
  );

  assert.deepEqual(sends[0], { to: "alex@example.com", subject: "Subject", html: "<p>Hello</p>", text: "Hello" });
  assert.equal(result.status, "sent");
  assert.match(database.queries[0].sql, /status = 'sent'/);
  assert.deepEqual(database.queries[0].params, ["log-1"]);
});

test("sendPredictorEmail marks failed and does not throw when the sender rejects", async () => {
  const database = db();
  const result = await sendPredictorEmail(
    { id: "sub-1", email: "alex@example.com" },
    { subject: "Subject", html: "<p>Hello</p>", text: "Hello" },
    database,
    { warn() {} },
    "log-1",
    async () => { throw new Error("provider down"); },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.error, "provider down");
  assert.match(database.queries[0].sql, /status = 'failed'/);
  assert.deepEqual(database.queries[0].params, ["log-1", "provider down"]);
});
