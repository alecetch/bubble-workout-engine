import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { INJURY_FLAG_OPTIONS } from "../src/utils/injuryFlags.js";

after(() => pool.end());

async function ensureDb(t) {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`);
    return false;
  }
}

async function withUser(fn) {
  const userId = (await pool.query("INSERT INTO app_user(subject_id) VALUES ($1) RETURNING id", [randomUUID()])).rows[0].id;
  try {
    return await fn(userId);
  } finally {
    await pool.query("DELETE FROM app_user WHERE id=$1", [userId]);
  }
}

const insertProfile = (userId, flags) =>
  pool.query("INSERT INTO client_profile(user_id, injury_flags) VALUES ($1, $2) RETURNING injury_flags", [userId, flags]);

test("client_profile accepts every canonical injury code and an empty list", async (t) => {
  if (!await ensureDb(t)) return;
  await withUser(async (userId) => {
    const codes = INJURY_FLAG_OPTIONS.map((option) => option.code);
    const { rows } = await insertProfile(userId, codes);
    assert.deepEqual(rows[0].injury_flags, codes);
    await pool.query("UPDATE client_profile SET injury_flags = '{}' WHERE user_id=$1", [userId]);
  });
});

for (const bad of [["Wrist / Elbow"], ["wrist_/_elbow"], ["lower_back_/_spine"], ["No Known Issues"], ["knee_issues", "mystery"]]) {
  test(`client_profile rejects non-canonical injury flags ${JSON.stringify(bad)}`, async (t) => {
    if (!await ensureDb(t)) return;
    await withUser(async (userId) => {
      await assert.rejects(insertProfile(userId, bad), (err) => {
        assert.equal(err.code, "23514");
        assert.equal(err.constraint, "chk_client_profile_injury_flags_codes");
        return true;
      });
    });
  });
}

test("the constraint's code list matches INJURY_FLAG_OPTIONS", async (t) => {
  if (!await ensureDb(t)) return;
  const { rows } = await pool.query(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'chk_client_profile_injury_flags_codes'",
  );
  assert.equal(rows.length, 1);
  const inConstraint = [...rows[0].def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
  assert.deepEqual(inConstraint, INJURY_FLAG_OPTIONS.map((option) => option.code).sort());
});
