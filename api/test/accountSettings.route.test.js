import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool, skip, log, response, withDeletionUser, accountCounts } from "../testSupport/accountDeletionFixtures.js";
import { makeAccountDeletionService } from "../src/services/accountDeletionService.js";
import { PHYSIQUE_BUCKET } from "../src/services/s3Service.js";
test.after(() => pool.end());
import {
  accountSettingsRouter,
  createAccountSettingsHandlers,
} from "../src/routes/accountSettings.js";

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

test("GET /api/users/me/account returns email and displayName for authenticated user", async () => {
  const handler = createAccountSettingsHandlers({
    query: async () => ({
      rows: [{ email: "test@example.com", display_name: "Test User" }],
    }),
  }).getAccount;
  const res = mockRes();

  await handler({ auth: { user_id: "user-1" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    email: "test@example.com",
    displayName: "Test User",
  });
});

test("GET /api/users/me/account returns 401 without auth", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", accountSettingsRouter);
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/users/me/account`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body?.code, "unauthorized");
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("PATCH /users/me/display-name updates display name and returns updated value", async () => {
  const calls = [];
  const handler = createAccountSettingsHandlers({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return {
        rows: [{ display_name: "New Name" }],
      };
    },
  }).patchDisplayName;
  const res = mockRes();

  await handler(
    { auth: { user_id: "user-1" }, body: { displayName: "  New Name  " } },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, displayName: "New Name" });
  assert.equal(calls[0].params[0], "New Name");
  assert.equal(calls[0].params[1], "user-1");
});

test("PATCH /users/me/display-name returns 400 for empty or too-long names", async () => {
  const handler = createAccountSettingsHandlers({
    query: async () => ({ rows: [] }),
  }).patchDisplayName;

  const emptyRes = mockRes();
  await handler({ auth: { user_id: "user-1" }, body: { displayName: "   " } }, emptyRes);
  assert.equal(emptyRes.statusCode, 400);
  assert.equal(emptyRes.body?.code, "validation_error");

  const longRes = mockRes();
  await handler(
    { auth: { user_id: "user-1" }, body: { displayName: "x".repeat(61) } },
    longRes,
  );
  assert.equal(longRes.statusCode, 400);
  assert.equal(longRes.body?.code, "validation_error");
});

test("DELETE /api/users/me delegates with app source and keeps its success response", async () => {
  const calls = [];
  const handler = createAccountSettingsHandlers({}, { accountDeletion: { deleteAccount: async (...args) => { calls.push(args); return { deleted: true }; } } }).deleteAccount;
  const res = mockRes();

  await handler({ auth: { user_id: "user-1" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(calls, [["user-1", { source: "app" }]]);
});

test("DELETE deletes only the authenticated user's rows and photo prefix", { skip }, () => withDeletionUser(async a => withDeletionUser(async b => {
  const prefixes = [];
  const accountDeletion = makeAccountDeletionService({ db: pool, log, deletePrefixFn: async (prefix, bucket) => {
    prefixes.push(prefix); assert.equal(bucket, PHYSIQUE_BUCKET); return { deleted: 1 };
  }, deleteSubscriberFn: async () => ({ skipped: true }) });
  const res = response();
  await createAccountSettingsHandlers(pool, { accountDeletion }).deleteAccount({ auth: { user_id: a.id } }, res);
  assert.deepEqual(res.body, { ok: true }); assert.equal(res.statusCode, 200);
  assert.deepEqual(await accountCounts(a.id), [0, 0, 0]);
  assert.deepEqual(await accountCounts(b.id), [1, 1, 1]);
  assert.deepEqual(prefixes, [`physique/${a.id}/`]);
})));

test("DELETE storage failure returns 503 deletion_failed with the account intact", { skip }, () => withDeletionUser(async user => {
  const accountDeletion = makeAccountDeletionService({ db: pool, log, deletePrefixFn: async () => { throw Error("offline"); } });
  const res = response();
  await createAccountSettingsHandlers(pool, { accountDeletion }).deleteAccount({ auth: { user_id: user.id } }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { ok: false, code: "deletion_failed", error: "We couldn't delete your account just now. Nothing was removed. Please try again." });
  assert.deepEqual(await accountCounts(user.id), [1, 1, 1]);
}));

test("DELETE /api/users/me returns 401 without auth", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", accountSettingsRouter);
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/users/me`, { method: "DELETE" });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body?.code, "unauthorized");
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("DELETE /api/users/me keeps an already-missing account idempotent", async () => {
  const handler = createAccountSettingsHandlers({}, { accountDeletion: { deleteAccount: async () => ({ deleted: false, reason: "not_found" }) } }).deleteAccount;
  const res = response();
  await handler({ auth: { user_id: "deleted-user" } }, res);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true });
});
