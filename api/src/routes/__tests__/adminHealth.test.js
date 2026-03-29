import test from "node:test";
import assert from "node:assert/strict";
import { createAdminHealthReportHandler } from "../adminHealth.js";

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test("createAdminHealthReportHandler returns near-render-ready report payload", async () => {
  const expectedReport = {
    summary: { critical: 1, warning: 2, info: 0 },
    rule_coverage: { rows: [], summary: { total: 0, fallback_only: 0, ok: 0 } },
    orphaned_rules: { rows: [], summary: { total: 0, critical: 0, warning: 0, info: 0 } },
    orphaned_prefs: { rows: [], summary: { total: 0, critical: 0, warning: 0, info: 0 } },
    uncovered_exercises: { rows: [], summary: { total: 0, critical: 0, warning: 0, info: 0 } },
    slot_coverage: { rows: [], summary: { total: 0, critical: 0, warning: 0, info: 0 } },
  };
  let capturedDb = null;
  const handler = createAdminHealthReportHandler({
    db: { query: async () => ({ rows: [] }) },
    buildReport: async (db) => {
      capturedDb = db;
      return expectedReport;
    },
  });

  const res = mockRes();
  await handler({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.report, expectedReport);
  assert.ok(capturedDb);
});

test("createAdminHealthReportHandler returns 500 envelope on failure", async () => {
  const handler = createAdminHealthReportHandler({
    db: {},
    buildReport: async () => {
      throw new Error("boom");
    },
  });

  const res = mockRes();
  await handler({}, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, "internal_error");
  assert.ok(res.body.error);
});
