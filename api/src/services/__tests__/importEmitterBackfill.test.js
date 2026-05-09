import test from "node:test";
import assert from "node:assert/strict";
import { importEmitterPayload } from "../importEmitterService.js";

function makeRows({ withExercise = true } = {}) {
  const rows = [
    ["PRG", "Test Program", "Summary", "1", "1", "{}", "0", "Mon", "[]"].join("|"),
    ["WEEK", "1", "Week Focus", "Week Notes"].join("|"),
    [
      "DAY",
      "1",
      "1",
      "1",
      "Day 1",
      "hypertrophy",
      "45",
      "format",
      "main",
      "secondary",
      "finisher",
      "0",
      "Mon",
      "d1",
    ].join("|"),
    [
      "SEG",
      "seg1",
      "single",
      "Main Lift",
      "none",
      "",
      "",
      "1",
      "",
      "{}",
      "0",
      "00:00",
      "block1",
      "1",
      "1",
      "main",
      "Main",
      "",
      "d1",
      "0",
    ].join("|"),
  ];

  if (withExercise) {
    rows.push(
      [
        "EX",
        "ex1",
        "1",
        "1",
        "main",
        "Main",
        "1",
        "3",
        "8-10",
        "reps",
        "RPE 8",
        "2-0-2-0",
        "90",
        "",
        "",
        "",
        "",
        "seg1",
        "single",
        "",
        "",
        "",
        "",
        "",
        "",
        "d1",
      ].join("|"),
    );
  }

  return rows;
}

function makeClient() {
  const calls = [];
  let weekId = 0;
  let dayId = 0;
  let segId = 0;

  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      if (sql.includes("information_schema.columns")) return { rows: [{ "1": 1 }], rowCount: 1 };
      if (sql.includes("SELECT COUNT(*) AS cnt FROM program_week")) return { rows: [{ cnt: "0" }], rowCount: 1 };
      if (sql.includes("INSERT INTO program_week")) return { rows: [{ id: `w${++weekId}` }], rowCount: 1 };
      if (sql.includes("INSERT INTO program_day")) return { rows: [{ id: `d${++dayId}` }], rowCount: 1 };
      if (sql.includes("INSERT INTO program_calendar_day")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO workout_segment")) return { rows: [{ id: `s${++segId}` }], rowCount: 1 };
      if (sql.includes("INSERT INTO program_exercise")) return { rows: [], rowCount: 1 };
      if (sql.includes("UPDATE program_exercise pe")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test("importEmitterPayload issues exercise backfill UPDATE after EX inserts", async () => {
  const programId = "program-123";
  const client = makeClient();

  await importEmitterPayload({
    poolOrClient: client,
    request_id: "req-1",
    payload: {
      user_id: "user-1",
      anchor_date_ms: Date.UTC(2026, 0, 1),
      program_id: programId,
      rows: makeRows({ withExercise: true }),
    },
  });

  const normalizedSql = client.calls.map((c) => ({ ...c, normalized: c.sql.replace(/\s+/g, " ").trim() }));
  const updateIdx = normalizedSql.findIndex((c) => /UPDATE program_exercise pe/i.test(c.normalized));
  const insertExIdx = normalizedSql.findIndex((c) => /INSERT INTO program_exercise/i.test(c.normalized));
  const commitIdx = normalizedSql.findIndex((c) => c.sql === "COMMIT");
  assert.ok(updateIdx >= 0, "expected backfill UPDATE query");
  assert.ok(insertExIdx >= 0, "expected program_exercise INSERT query");
  assert.ok(commitIdx >= 0, "expected COMMIT query");
  assert.ok(updateIdx > insertExIdx, "expected UPDATE after EX inserts");
  assert.ok(updateIdx < commitIdx, "expected UPDATE before COMMIT");

  const updateCall = client.calls[updateIdx];
  assert.deepEqual(updateCall.params, [programId]);
  assert.match(updateCall.sql, /FROM exercise_catalogue ec/i);
  assert.match(updateCall.sql, /exercise_name\s*=\s*ec\.name/i);
  assert.match(updateCall.sql, /equipment_items_slugs_csv/i);
});

test("backfill UPDATE is scoped to program_id (not global)", async () => {
  const programId = "program-scoped";
  const client = makeClient();

  await importEmitterPayload({
    poolOrClient: client,
    request_id: "req-2",
    payload: {
      user_id: "user-2",
      anchor_date_ms: Date.UTC(2026, 0, 1),
      program_id: programId,
      rows: makeRows({ withExercise: true }),
    },
  });

  const updateCall = client.calls.find((c) => /UPDATE program_exercise pe/i.test(c.sql));
  assert.ok(updateCall, "expected UPDATE query");
  assert.match(updateCall.sql, /AND pe\.program_id = \$1/i);
  assert.deepEqual(updateCall.params, [programId]);
});

test("backfill UPDATE handles zero EX rows without error", async () => {
  const client = makeClient();

  await assert.doesNotReject(async () =>
    importEmitterPayload({
      poolOrClient: client,
      request_id: "req-3",
      payload: {
        user_id: "user-3",
        anchor_date_ms: Date.UTC(2026, 0, 1),
        program_id: "program-empty-ex",
        rows: makeRows({ withExercise: false }),
      },
    }),
  );

  const commitCall = client.calls.find((c) => c.sql === "COMMIT");
  const updateCall = client.calls.find((c) => /UPDATE program_exercise pe/i.test(c.sql));
  assert.ok(updateCall, "expected UPDATE query even when there are no EX rows");
  assert.ok(commitCall, "expected COMMIT query");
});
