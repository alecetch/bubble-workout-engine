import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { backfillInjuryFlags } from "../scripts/backfillInjuryFlags.mjs";
after(() => pool.end());
test("backfill dry run, apply, idempotency and unknown rows", async t => {
  try { await pool.query("SELECT 1"); } catch (e) { t.skip(`Postgres unavailable: ${e.code}`); return; }
  const users = [];
  const ids = [];
  const values = [["Wrist / Elbow"], ["lower_back_/_spine"], ["mystery", "Knee Issues"]];
  const client = await pool.connect();
  try {
    for (const flags of values) {
      const user = (await pool.query("INSERT INTO app_user(subject_id) VALUES ($1) RETURNING id", [randomUUID()])).rows[0].id;
      users.push(user);
      ids.push((await pool.query("INSERT INTO client_profile(user_id, injury_flags) VALUES ($1,$2) RETURNING id", [user, flags])).rows[0].id);
    }
    const scoped = { query(sql, params) {
      if (sql.startsWith("SELECT id, injury_flags")) return client.query("SELECT id, injury_flags FROM client_profile WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids]);
      return client.query(sql, params);
    } };
    const read = async () => Promise.all(ids.map(async id => (await pool.query("SELECT injury_flags FROM client_profile WHERE id=$1", [id])).rows[0].injury_flags));
    const dry = await backfillInjuryFlags(scoped);
    assert.equal(dry.changed, 2); assert.equal(dry.unknownRows, 1);
    assert.deepEqual(dry.unknownValues, { mystery: 1 });
    assert.deepEqual(await read(), values);
    const applied = await backfillInjuryFlags(scoped, { apply: true });
    assert.equal(applied.changed, 2);
    assert.deepEqual(await read(), [["wrist_elbow"], ["lower_back_spine"], values[2]]);
    assert.equal((await backfillInjuryFlags(scoped, { apply: true })).changed, 0);
    assert.ok(!JSON.stringify(applied).includes(users[0]));
  } finally {
    client.release();
    for (const id of users) await pool.query("DELETE FROM app_user WHERE id=$1", [id]);
  }
});
