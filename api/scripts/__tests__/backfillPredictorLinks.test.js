import assert from "node:assert/strict";
import test from "node:test";
import { backfillPredictorLinks } from "../backfillPredictorLinks.js";

function createDb({ predictorRows = [], submissionRows = [] } = {}) {
  const state = {
    predictorRows,
    submissionRows,
    updates: [],
  };
  return {
    state,
    async query(sql, params = []) {
      if (/SELECT id, email, created_at FROM hyrox_submissions/i.test(sql)) {
        return { rows: state.submissionRows.filter((row) => row.linked_predictor_submission_id == null) };
      }
      if (/SELECT id FROM hyrox_predictor_submissions/i.test(sql)) {
        const [email, createdAt] = params;
        const rows = state.predictorRows
          .filter((row) => row.email === email && row.research_consent === true && row.created_at < createdAt)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return { rows: rows.slice(0, 1) };
      }
      if (/UPDATE hyrox_submissions/i.test(sql)) {
        const [predictorId, submissionId] = params;
        const row = state.submissionRows.find((item) => item.id === submissionId && item.linked_predictor_submission_id == null);
        if (!row) return { rows: [], rowCount: 0 };
        row.linked_predictor_submission_id = predictorId;
        state.updates.push({ predictorId, submissionId });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test("backfillPredictorLinks links to the latest consented prior predictor row", async () => {
  const db = createDb({
    submissionRows: [{ id: "result-1", email: "alex@example.com", created_at: "2026-07-10T10:00:00Z" }],
    predictorRows: [
      { id: "old", email: "alex@example.com", research_consent: true, created_at: "2026-07-01T10:00:00Z" },
      { id: "new", email: "alex@example.com", research_consent: true, created_at: "2026-07-05T10:00:00Z" },
    ],
  });

  const result = await backfillPredictorLinks(db, { info() {} });

  assert.equal(result.linkedCount, 1);
  assert.equal(db.state.submissionRows[0].linked_predictor_submission_id, "new");
});

test("backfillPredictorLinks does not link unconsented or future predictor rows", async () => {
  const db = createDb({
    submissionRows: [
      { id: "result-1", email: "alex@example.com", created_at: "2026-07-10T10:00:00Z" },
      { id: "result-2", email: "sam@example.com", created_at: "2026-07-10T10:00:00Z" },
    ],
    predictorRows: [
      { id: "unconsented", email: "alex@example.com", research_consent: false, created_at: "2026-07-01T10:00:00Z" },
      { id: "future", email: "sam@example.com", research_consent: true, created_at: "2026-07-11T10:00:00Z" },
    ],
  });

  const result = await backfillPredictorLinks(db, { info() {} });

  assert.equal(result.linkedCount, 0);
  assert.equal(db.state.submissionRows[0].linked_predictor_submission_id, undefined);
  assert.equal(db.state.submissionRows[1].linked_predictor_submission_id, undefined);
});

test("backfillPredictorLinks is idempotent", async () => {
  const db = createDb({
    submissionRows: [{ id: "result-1", email: "alex@example.com", created_at: "2026-07-10T10:00:00Z" }],
    predictorRows: [{ id: "predictor-1", email: "alex@example.com", research_consent: true, created_at: "2026-07-01T10:00:00Z" }],
  });

  await backfillPredictorLinks(db, { info() {} });
  const second = await backfillPredictorLinks(db, { info() {} });

  assert.equal(db.state.updates.length, 1);
  assert.equal(second.scannedCount, 0);
  assert.equal(second.linkedCount, 0);
});

test("backfillPredictorLinks leaves no-match rows untouched", async () => {
  const db = createDb({
    submissionRows: [{ id: "result-1", email: "alex@example.com", created_at: "2026-07-10T10:00:00Z" }],
    predictorRows: [{ id: "predictor-1", email: "other@example.com", research_consent: true, created_at: "2026-07-01T10:00:00Z" }],
  });

  const result = await backfillPredictorLinks(db, { info() {} });

  assert.equal(result.linkedCount, 0);
  assert.equal(db.state.updates.length, 0);
});
