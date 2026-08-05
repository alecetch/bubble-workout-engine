import assert from "node:assert/strict";
import test from "node:test";
import { linkAppUserAccounts } from "../linkAppUserAccounts.js";

function createDb({
  appUsers = [],
  submissions = [],
  predictorSubmissions = [],
} = {}) {
  const state = {
    appUsers: appUsers.map((row) => ({ ...row })),
    hyrox_submissions: submissions.map((row) => ({ ...row })),
    hyrox_predictor_submissions: predictorSubmissions.map((row) => ({ ...row })),
    queries: [],
  };

  return {
    state,
    async query(sql, params = []) {
      state.queries.push({ sql, params });

      if (/SELECT id, email FROM hyrox_submissions/i.test(sql)) {
        return {
          rows: state.hyrox_submissions.filter((row) => row.app_link_consent === true && row.linked_app_user_id == null),
        };
      }
      if (/SELECT id, email FROM hyrox_predictor_submissions/i.test(sql)) {
        return {
          rows: state.hyrox_predictor_submissions.filter((row) => row.app_link_consent === true && row.linked_app_user_id == null),
        };
      }
      if (/SELECT id FROM app_user/i.test(sql)) {
        const email = String(params[0] ?? "").toLowerCase();
        const match = state.appUsers.find((row) => row.email != null && String(row.email).toLowerCase() === email);
        return { rows: match ? [{ id: match.id }] : [] };
      }
      if (/UPDATE hyrox_submissions/i.test(sql)) {
        const row = state.hyrox_submissions.find((item) => item.id === params[1]);
        if (!row || row.linked_app_user_id != null) return { rows: [], rowCount: 0 };
        row.linked_app_user_id = params[0];
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE hyrox_predictor_submissions/i.test(sql)) {
        const row = state.hyrox_predictor_submissions.find((item) => item.id === params[1]);
        if (!row || row.linked_app_user_id != null) return { rows: [], rowCount: 0 };
        row.linked_app_user_id = params[0];
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

const silentLog = { info() {} };

test("linkAppUserAccounts links consented hyrox_submissions by case-insensitive app_user email", async () => {
  const db = createDb({
    appUsers: [{ id: "user-1", email: "athlete@example.com" }],
    submissions: [{ id: "sub-1", email: "Athlete@Example.com", app_link_consent: true, linked_app_user_id: null }],
  });

  const result = await linkAppUserAccounts(db, silentLog);

  assert.deepEqual(result, { submissionsLinked: 1, predictorSubmissionsLinked: 0 });
  assert.equal(db.state.hyrox_submissions[0].linked_app_user_id, "user-1");
});

test("linkAppUserAccounts does not link unconsented submissions with a matching email", async () => {
  const db = createDb({
    appUsers: [{ id: "user-1", email: "athlete@example.com" }],
    submissions: [{ id: "sub-1", email: "athlete@example.com", app_link_consent: false, linked_app_user_id: null }],
  });

  const result = await linkAppUserAccounts(db, silentLog);

  assert.equal(result.submissionsLinked, 0);
  assert.equal(db.state.hyrox_submissions[0].linked_app_user_id, null);
});

test("linkAppUserAccounts does not link when no matching non-null app_user email exists", async () => {
  const db = createDb({
    appUsers: [
      { id: "user-null", email: null },
      { id: "user-other", email: "other@example.com" },
    ],
    submissions: [{ id: "sub-1", email: "athlete@example.com", app_link_consent: true, linked_app_user_id: null }],
  });

  const result = await linkAppUserAccounts(db, silentLog);

  assert.equal(result.submissionsLinked, 0);
  assert.equal(db.state.hyrox_submissions[0].linked_app_user_id, null);
});

test("linkAppUserAccounts has no created_at ordering constraint", async () => {
  const db = createDb({
    appUsers: [
      { id: "user-before", email: "before@example.com", created_at: "2026-01-01" },
      { id: "user-after", email: "after@example.com", created_at: "2026-08-01" },
    ],
    submissions: [
      { id: "sub-after", email: "before@example.com", app_link_consent: true, linked_app_user_id: null, created_at: "2026-08-01" },
      { id: "sub-before", email: "after@example.com", app_link_consent: true, linked_app_user_id: null, created_at: "2026-01-01" },
    ],
  });

  const result = await linkAppUserAccounts(db, silentLog);

  assert.equal(result.submissionsLinked, 2);
  assert.equal(db.state.hyrox_submissions[0].linked_app_user_id, "user-before");
  assert.equal(db.state.hyrox_submissions[1].linked_app_user_id, "user-after");
  assert.equal(db.state.queries.some((query) => /created_at\s*</i.test(query.sql)), false);
});

test("linkAppUserAccounts is idempotent for already-linked rows", async () => {
  const db = createDb({
    appUsers: [{ id: "user-1", email: "athlete@example.com" }],
    submissions: [{ id: "sub-1", email: "athlete@example.com", app_link_consent: true, linked_app_user_id: null }],
  });

  const first = await linkAppUserAccounts(db, silentLog);
  const second = await linkAppUserAccounts(db, silentLog);

  assert.equal(first.submissionsLinked, 1);
  assert.deepEqual(second, { submissionsLinked: 0, predictorSubmissionsLinked: 0 });
  assert.equal(db.state.hyrox_submissions[0].linked_app_user_id, "user-1");
});

test("linkAppUserAccounts independently links predictor submissions in the same run", async () => {
  const db = createDb({
    appUsers: [
      { id: "user-sub", email: "submission@example.com" },
      { id: "user-predictor", email: "predictor@example.com" },
    ],
    submissions: [{ id: "sub-1", email: "submission@example.com", app_link_consent: true, linked_app_user_id: null }],
    predictorSubmissions: [{ id: "pred-sub-1", email: "predictor@example.com", app_link_consent: true, linked_app_user_id: null }],
  });

  const result = await linkAppUserAccounts(db, silentLog);

  assert.deepEqual(result, { submissionsLinked: 1, predictorSubmissionsLinked: 1 });
  assert.equal(db.state.hyrox_submissions[0].linked_app_user_id, "user-sub");
  assert.equal(db.state.hyrox_predictor_submissions[0].linked_app_user_id, "user-predictor");
});
