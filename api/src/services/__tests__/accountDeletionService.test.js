import { dbAvailableOrSkip } from "../../../test/helpers/requireDb.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, log, withDeletionUser, accountCounts } from "../../../testSupport/accountDeletionFixtures.js";
import { makeAccountDeletionService, AccountDeletionError } from "../accountDeletionService.js";
import { PHYSIQUE_BUCKET } from "../s3Service.js";
test.after(() => pool.end());

test("photos go before the user and cascade rows; RevenueCat goes last", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
return withDeletionUser(async user => {
  const events = [];
  const service = makeAccountDeletionService({ db: pool, log, deletePrefixFn: async (prefix, bucket) => {
    assert.equal(prefix, `physique/${user.id}/`); assert.equal(bucket, PHYSIQUE_BUCKET);
    assert.deepEqual(await accountCounts(user.id), [1, 1, 1]); events.push("photos");
    return { deleted: 2 };
  }, deleteSubscriberFn: async id => {
    assert.equal(id, user.id); assert.deepEqual(await accountCounts(id), [0, 0, 0]); events.push("revenuecat");
    return { deleted: true };
  } });
  assert.deepEqual(await service.deleteAccount(user.id.toUpperCase(), { source: "app" }), { deleted: true, photosDeleted: 2 });
  assert.deepEqual(events, ["photos", "revenuecat"]);
});
});

test("storage failure preserves the account, profile and photo rows completely", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
return withDeletionUser(async user => {
  const events = [];
  const service = makeAccountDeletionService({ db: pool, log: { error: event => events.push(event) },
    deletePrefixFn: async () => { throw Error("sensitive photo key"); }, deleteSubscriberFn: async () => assert.fail("No RevenueCat call") });
  await assert.rejects(service.deleteAccount(user.id, { source: "web" }), error => error instanceof AccountDeletionError && error.code === "storage_failed");
  assert.deepEqual(await accountCounts(user.id), [1, 1, 1]);
  assert.deepEqual(events, [{ event: "account.delete.storage_failed", userId: user.id, source: "web" }]);
});
});

for (const mode of ["failed", "skipped"]) test(`RevenueCat ${mode} never blocks deletion`, async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
return withDeletionUser(async user => {
  const events = [];
  const service = makeAccountDeletionService({ db: pool, log: { info: x => events.push(x), warn: x => events.push(x) },
    deletePrefixFn: async () => ({ deleted: 0 }), deleteSubscriberFn: async () => {
      if (mode === "failed") throw Error("upstream"); return { skipped: true };
    } });
  assert.equal((await service.deleteAccount(user.id, { source: "app" })).deleted, true);
  assert.deepEqual(await accountCounts(user.id), [0, 0, 0]);
  assert.equal(events[0].event, `account.delete.revenuecat_${mode}`);
  assert.deepEqual(events[1], { event: "account.delete.completed", userId: user.id, source: "app", photos_deleted: 0 });
});
});

test("unknown and invalid IDs make no storage calls", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;

  const service = makeAccountDeletionService({ db: pool, log, deletePrefixFn: async () => assert.fail("No storage call") });
  for (const id of ["not-a-uuid", randomUUID()]) assert.deepEqual(await service.deleteAccount(id, { source: "app" }), { deleted: false, reason: "not_found" });

});
