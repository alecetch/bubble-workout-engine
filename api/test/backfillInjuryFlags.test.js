import test from "node:test";
import assert from "node:assert/strict";
import { backfillInjuryFlags } from "../scripts/backfillInjuryFlags.mjs";

// V153 adds a CHECK constraint, so legacy values can no longer be stored in Postgres.
// The backfill logic is exercised against an in-memory client that honours BEGIN/COMMIT/ROLLBACK.
function fakeDb(rows) {
  const store = new Map(rows.map((row) => [row.id, [...row.injury_flags]]));
  const pending = new Map();
  return {
    store,
    async query(sql, params) {
      if (sql === "BEGIN" || sql === "ROLLBACK") {
        pending.clear();
        return { rows: [] };
      }
      if (sql.startsWith("SELECT id, injury_flags")) {
        return { rows: [...store].map(([id, flags]) => ({ id, injury_flags: [...flags] })) };
      }
      if (sql.startsWith("UPDATE client_profile SET injury_flags")) {
        pending.set(params[0], params[1]);
        return { rows: [] };
      }
      if (sql === "COMMIT") {
        for (const [id, flags] of pending) store.set(id, flags);
        pending.clear();
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in fake client: ${sql}`);
    },
  };
}

test("backfill dry run, apply, idempotency and unknown rows", async () => {
  const values = [["Wrist / Elbow"], ["lower_back_/_spine"], ["mystery", "Knee Issues"]];
  const ids = ["profile-a", "profile-b", "profile-c"];
  const db = fakeDb(ids.map((id, i) => ({ id, injury_flags: values[i] })));
  const read = () => ids.map((id) => db.store.get(id));

  const dry = await backfillInjuryFlags(db);
  assert.equal(dry.changed, 2);
  assert.equal(dry.unknownRows, 1);
  assert.deepEqual(dry.unknownValues, { mystery: 1 });
  assert.deepEqual(read(), values);

  const applied = await backfillInjuryFlags(db, { apply: true });
  assert.equal(applied.changed, 2);
  assert.deepEqual(read(), [["wrist_elbow"], ["lower_back_spine"], values[2]]);

  assert.equal((await backfillInjuryFlags(db, { apply: true })).changed, 0);
  assert.ok(!JSON.stringify(applied).includes("profile-a"));
});
