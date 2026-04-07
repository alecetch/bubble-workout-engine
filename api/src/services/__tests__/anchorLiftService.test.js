import test from "node:test";
import assert from "node:assert/strict";
import { makeAnchorLiftService } from "../anchorLiftService.js";

function createMockDb(handler) {
  return {
    query: handler,
  };
}

test("upsertAnchorLifts creates rows", async () => {
  const calls = [];
  const db = createMockDb(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("FROM exercise_catalogue")) {
      return {
        rows: [
          { exercise_id: "bb_back_squat", estimation_family: "squat" },
        ],
      };
    }
    if (sql.includes("INSERT INTO client_anchor_lift")) {
      return {
        rows: [
          {
            client_profile_id: params[0],
            estimation_family: params[1],
            exercise_id: params[2],
            load_kg: params[3],
            reps: params[4],
            rir: params[5],
            skipped: params[6],
          },
        ],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const service = makeAnchorLiftService(db);
  const rows = await service.upsertAnchorLifts("profile-1", [
    { estimationFamily: "squat", exerciseId: "bb_back_squat", loadKg: 100, reps: 5, rir: 2 },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].exercise_id, "bb_back_squat");
  assert.equal(calls.length, 2);
});

test("upsertAnchorLifts updates existing rows via ON CONFLICT", async () => {
  let insertCount = 0;
  const db = createMockDb(async (sql, params) => {
    if (sql.includes("FROM exercise_catalogue")) {
      return {
        rows: [{ exercise_id: "bb_back_squat", estimation_family: "squat" }],
      };
    }
    if (sql.includes("INSERT INTO client_anchor_lift")) {
      insertCount += 1;
      return {
        rows: [{
          estimation_family: params[1],
          exercise_id: params[2],
          load_kg: params[3],
          reps: params[4],
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const service = makeAnchorLiftService(db);
  await service.upsertAnchorLifts("profile-1", [
    { estimationFamily: "squat", exerciseId: "bb_back_squat", loadKg: 90, reps: 8 },
  ]);
  await service.upsertAnchorLifts("profile-1", [
    { estimationFamily: "squat", exerciseId: "bb_back_squat", loadKg: 95, reps: 6 },
  ]);

  assert.equal(insertCount, 2);
});

test("getAnchorLifts filters out skipped rows", async () => {
  const db = createMockDb(async (sql) => {
    assert.match(sql, /skipped = false/);
    return {
      rows: [{ estimation_family: "squat" }],
    };
  });

  const service = makeAnchorLiftService(db);
  const rows = await service.getAnchorLifts("profile-1");
  assert.deepEqual(rows, [{ estimation_family: "squat" }]);
});
