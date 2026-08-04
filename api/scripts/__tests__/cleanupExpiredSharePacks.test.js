import assert from "node:assert/strict";
import test from "node:test";
import { cleanupExpiredSharePacks } from "../cleanupExpiredSharePacks.js";
import { SLIDE_FILENAMES } from "../../src/hyrox/sharePack/slideAssets.js";

function createDb({ expiredRows = [] } = {}) {
  const state = { expiredRows: [...expiredRows], deletes: [] };
  return {
    state,
    async query(sql, params = []) {
      if (/SELECT id, submission_id, zip_key, race_card_key/i.test(sql)) {
        return { rows: state.expiredRows };
      }
      if (/DELETE FROM hyrox_share_packs WHERE id = \$1/i.test(sql)) {
        const [id] = params;
        state.deletes.push(id);
        state.expiredRows = state.expiredRows.filter((row) => row.id !== id);
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test("deletes S3 objects and the DB row for an expired complete pack", async () => {
  const db = createDb({
    expiredRows: [{ id: "pack-1", submission_id: "sub-1", zip_key: "hyrox-share-packs/sub-1/forma-hyrox.zip", race_card_key: "hyrox-share-packs/sub-1/race-card.png" }],
  });
  const deletedKeys = [];
  const deleteObject = async (key) => { deletedKeys.push(key); };

  const result = await cleanupExpiredSharePacks(db, { deleteObject, log: { warn() {}, info() {} } });

  assert.equal(result.deletedCount, 1);
  assert.equal(result.objectErrorCount, 0);
  assert.deepEqual(db.state.deletes, ["pack-1"]);
  assert.ok(deletedKeys.includes("hyrox-share-packs/sub-1/forma-hyrox.zip"));
  assert.ok(deletedKeys.includes("hyrox-share-packs/sub-1/race-card.png"));
  for (const filename of SLIDE_FILENAMES) {
    assert.ok(deletedKeys.includes(`hyrox-share-packs/sub-1/${filename}`), `expected ${filename} to be deleted`);
  }
  assert.equal(deletedKeys.length, 2 + SLIDE_FILENAMES.length);
});

test("handles an expired race-card-only row without deleting slide/zip keys", async () => {
  const db = createDb({
    expiredRows: [{ id: "pack-2", submission_id: "sub-2", zip_key: null, race_card_key: "hyrox-share-packs/sub-2/race-card.png" }],
  });
  const deletedKeys = [];
  const deleteObject = async (key) => { deletedKeys.push(key); };

  const result = await cleanupExpiredSharePacks(db, { deleteObject, log: { warn() {}, info() {} } });

  assert.equal(result.deletedCount, 1);
  assert.deepEqual(deletedKeys, ["hyrox-share-packs/sub-2/race-card.png"]);
  assert.deepEqual(db.state.deletes, ["pack-2"]);
});

test("continues past an S3 delete failure and still deletes the DB row", async () => {
  const db = createDb({
    expiredRows: [{ id: "pack-3", submission_id: "sub-3", zip_key: "hyrox-share-packs/sub-3/forma-hyrox.zip", race_card_key: null }],
  });
  const deleteObject = async (key) => {
    if (key.endsWith("forma-hyrox.zip")) throw new Error("S3 unavailable");
  };
  const warnCalls = [];

  const result = await cleanupExpiredSharePacks(db, { deleteObject, log: { warn: (...a) => warnCalls.push(a), info() {} } });

  assert.equal(result.deletedCount, 1);
  assert.ok(result.objectErrorCount >= 1);
  assert.deepEqual(db.state.deletes, ["pack-3"]);
  assert.ok(warnCalls.length >= 1);
});

test("processes multiple expired rows and returns an accurate count", async () => {
  const db = createDb({
    expiredRows: [
      { id: "pack-4", submission_id: "sub-4", zip_key: null, race_card_key: "hyrox-share-packs/sub-4/race-card.png" },
      { id: "pack-5", submission_id: "sub-5", zip_key: null, race_card_key: "hyrox-share-packs/sub-5/race-card.png" },
    ],
  });

  const result = await cleanupExpiredSharePacks(db, { deleteObject: async () => {}, log: { warn() {}, info() {} } });

  assert.equal(result.deletedCount, 2);
  assert.deepEqual(db.state.deletes, ["pack-4", "pack-5"]);
});

test("the expired-row query filters on expires_at IS NOT NULL AND expires_at < NOW()", async () => {
  let capturedSql = null;
  const db = {
    async query(sql) {
      capturedSql = sql;
      return { rows: [] };
    },
  };

  await cleanupExpiredSharePacks(db, { deleteObject: async () => {}, log: { warn() {}, info() {} } });

  assert.match(capturedSql, /expires_at IS NOT NULL/);
  assert.match(capturedSql, /expires_at < NOW\(\)/);
});
