import { dbAvailableOrSkip } from "./helpers/requireDb.js";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import { MemoryStore } from "express-rate-limit";
import { marketingRouter, createDeleteAccountHandler, createDeleteAccountLimiter } from "../src/routes/marketingPages.js";
import { makeAccountDeletionService } from "../src/services/accountDeletionService.js";
import { pool, log, withDeletionUser, accountCounts } from "../testSupport/accountDeletionFixtures.js";
test.after(() => pool.end());

async function withServer(app, fn) {
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/delete-account`;
  const post = async fields => {
    const res = await fetch(url, { method: "POST", body: new URLSearchParams(fields) });
    return { status: res.status, body: await res.text() };
  };
  try { return await fn(url, post); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function appFor(deps = {}) {
  const app = express();
  app.post("/delete-account", createDeleteAccountLimiter({ store: new MemoryStore() }), express.urlencoded({ extended: false }), createDeleteAccountHandler(deps));
  return app;
}

test("public GET is ungated, noindex and contains ownership/consent and subscription fields", async () => {
  const previous = process.env.MARKETING_PREVIEW_ENABLED;
  process.env.MARKETING_PREVIEW_ENABLED = "false";
  try {
    const app = express(); app.use(marketingRouter);
    await withServer(app, async url => {
      const res = await fetch(url), body = await res.text();
      assert.equal(res.status, 200);
      for (const text of ['<meta name="robots" content="noindex">', 'action="/delete-account"', 'name="email"', 'type="email"', 'autocomplete="email"', 'name="password"', 'type="password"', 'autocomplete="current-password"', 'name="confirm"', 'required', 'https://apps.apple.com/account/subscriptions', 'https://play.google.com/store/account/subscriptions', 'progress photos', 'Delete my account']) assert.ok(body.includes(text), text);
      assert.equal(res.headers.get("cache-control"), "no-store");
    });
  } finally { if (previous === undefined) delete process.env.MARKETING_PREVIEW_ENABLED; else process.env.MARKETING_PREVIEW_ENABLED = previous; }
});

test("valid web credentials delete the account and show the subscription reminder", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
return withDeletionUser(async user => {
  const accountDeletion = makeAccountDeletionService({ db: pool, log, deletePrefixFn: async () => ({ deleted: 2 }), deleteSubscriberFn: async () => ({ skipped: true }) });
  await withServer(appFor({ db: pool, accountDeletion }), async (_url, post) => {
    const result = await post({ email: ` ${user.email.toUpperCase()} `, password: user.password, confirm: "on" });
    assert.equal(result.status, 200); assert.match(result.body, /Your account and data have been deleted/);
    assert.match(result.body, /does not cancel a store subscription/);
    assert.deepEqual(await accountCounts(user.id), [0, 0, 0]);
  });
});
});

test("wrong and unknown credentials have identical responses and compare exactly once each", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
return withDeletionUser(async user => {
  const comparisons = [];
  const app = appFor({ db: pool, accountDeletion: { deleteAccount: () => assert.fail("no deletion") }, compare: async (password, hash) => {
    comparisons.push(hash); return bcrypt.compare(password, hash);
  } });
  await withServer(app, async (_url, post) => {
    const wrong = await post({ email: user.email, password: "wrong", confirm: "on" });
    const unknown = await post({ email: "unknown@example.test", password: "wrong", confirm: "on" });
    assert.equal(wrong.status, 400); assert.deepEqual(wrong, unknown);
    assert.match(wrong.body, /email and password don/);
    assert.equal(comparisons.length, 2); assert.equal(bcrypt.getRounds(comparisons[1]), 12);
    assert.deepEqual(await accountCounts(user.id), [1, 1, 1]);
    assert.ok(!wrong.body.includes(user.email));
  });
});
});

test("missing fields or unticked confirm return validation errors without a lookup", async () => {
  let comparisons = 0;
  await withServer(appFor({ db: { query: () => assert.fail("no lookup") }, compare: async () => { comparisons++; return false; } }), async (_url, post) => {
    for (const fields of [{}, { email: "a@b.test", password: "pw" }, { email: "a@b.test", confirm: "on" }, { password: "pw", confirm: "on" }]) {
      const result = await post(fields); assert.equal(result.status, 400); assert.match(result.body, /Please fill in every field and tick the box/);
    }
    assert.equal(comparisons, 4);
  });
});

test("an account without a password can never authenticate against the dummy hash", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
return withDeletionUser(async user => {
  await pool.query("UPDATE app_user SET password_hash=NULL WHERE id=$1", [user.id]);
  let comparisons = 0;
  await withServer(appFor({ db: pool, compare: async () => { comparisons++; return true; }, accountDeletion: { deleteAccount: () => assert.fail("No password credential exists") } }), async (_url, post) => {
    const result = await post({ email: user.email, password: "dummy-password-match", confirm: "on" });
    assert.equal(result.status, 400); assert.match(result.body, /email and password don/);
    assert.equal(comparisons, 1); assert.deepEqual(await accountCounts(user.id), [1, 1, 1]);
  });
});
});

test("storage failure renders a retry page and leaves all account rows intact", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
return withDeletionUser(async user => {
  const accountDeletion = makeAccountDeletionService({ db: pool, log, deletePrefixFn: async () => { throw Error("offline"); } });
  await withServer(appFor({ db: pool, accountDeletion }), async (_url, post) => {
    const result = await post({ email: user.email, password: user.password, confirm: "on" });
    assert.equal(result.status, 503); assert.match(result.body, /Nothing was removed/); assert.match(result.body, /few minutes, or email support/);
    assert.deepEqual(await accountCounts(user.id), [1, 1, 1]);
  });
});
});

test("sixth POST is IP-limited with a rendered page", async () => {
  let comparisons = 0;
  await withServer(appFor({ compare: async () => { comparisons++; return false; } }), async (_url, post) => {
    for (let i = 0; i < 5; i++) assert.equal((await post({})).status, 400);
    const result = await post({}); assert.equal(result.status, 429); assert.match(result.body, /Too many attempts. Try again later/);
    assert.match(result.body, /<form/); assert.equal(comparisons, 5);
  });
});
