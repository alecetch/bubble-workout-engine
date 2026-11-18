import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { run } from "../scripts/cleanup-orphaned-physique-photos.mjs";
import { PHYSIQUE_BUCKET } from "../src/services/s3Service.js";
import { pool, skip, withDeletionUser } from "../testSupport/accountDeletionFixtures.js";
test.after(() => pool.end());

for (const apply of [false, true]) test(`cleanup ${apply ? "apply" : "dry run"} preserves live and invalid prefixes`, { skip }, () => withDeletionUser(async user => {
  const orphan = `physique/${randomUUID()}/`, deleted = [], logs = [];
  const summary = await run({ db: pool, apply, log: event => logs.push(event),
    listPrefixesFn: async (prefix, bucket) => { assert.equal(prefix, "physique/"); assert.equal(bucket, PHYSIQUE_BUCKET); return [`physique/${user.id}/`, orphan, "physique/not-a-uuid/"]; },
    countFn: async prefix => { assert.equal(prefix, orphan); return 3; },
    deletePrefixFn: async (prefix, bucket) => { deleted.push(prefix); assert.equal(bucket, PHYSIQUE_BUCKET); return { deleted: 3 }; },
  });
  assert.deepEqual(summary, { checked: 2, orphaned: 1, skipped: 1, objects_deleted: apply ? 3 : 0 });
  assert.deepEqual(deleted, apply ? [orphan] : []);
  assert.deepEqual(logs[0], { prefix: orphan, objects: 3, apply });
}));

test("cleanup batches UUID lookups at 500 and never deletes a newly present user", async () => {
  const prefixes = Array.from({ length: 501 }, () => `physique/${randomUUID()}/`), batches = [];
  const summary = await run({ apply: true, log() {}, listPrefixesFn: async () => prefixes,
    db: { query: async (sql, args) => {
      if (sql.includes("ANY")) { batches.push(args[0].length); return { rows: [] }; }
      return { rows: [{ id: args[0] }] };
    } }, countFn: () => assert.fail("not an orphan anymore"), deletePrefixFn: () => assert.fail("no live-user deletion"),
  });
  assert.deepEqual(batches, [500, 1]); assert.equal(summary.orphaned, 0);
});

test("cleanup propagates storage failures for a nonzero CLI exit", async () => {
  await assert.rejects(run({ listPrefixesFn: async () => { throw Error("storage offline"); }, log() {} }), /storage offline/);
});
