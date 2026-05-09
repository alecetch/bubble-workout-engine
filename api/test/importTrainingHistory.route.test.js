import test from "node:test";
import assert from "node:assert/strict";
import { createImportHandlers } from "../src/routes/trainingHistoryImport.js";

const USER_UUID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const IMPORT_UUID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";

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

function makeNext() {
  const calls = [];
  const next = (err) => calls.push(err ?? null);
  next.calls = calls;
  return next;
}

function makeCsvBuffer(exerciseName = "Barbell Back Squat") {
  const date = new Date();
  date.setDate(date.getDate() - 3);
  const dateStr = date.toISOString().slice(0, 10);
  const csv = [
    "Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
    `${dateStr},Morning Workout,${exerciseName},1,100,5,,,,,`,
  ].join("\n");
  return Buffer.from(csv, "utf8");
}

test("import: unsupported source_app returns 400", async () => {
  const db = { async query() { throw new Error("DB should not be called"); } };
  const { postTrainingHistory } = createImportHandlers(db, {
    importService: {
      async processHevyCsv() {
        throw new Error("Service should not be called");
      },
    },
  });

  const req = {
    auth: { user_id: USER_UUID },
    body: { source_app: "unsupported_app" },
    file: { buffer: makeCsvBuffer() },
  };
  const res = mockRes();

  await postTrainingHistory(req, res, makeNext());

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "unsupported_source_app");
});

test("import: missing file returns 400", async () => {
  const db = { async query() { throw new Error("DB should not be called"); } };
  const { postTrainingHistory } = createImportHandlers(db, {
    importService: {
      async processHevyCsv() {
        throw new Error("Service should not be called");
      },
    },
  });

  const req = {
    auth: { user_id: USER_UUID },
    body: { source_app: "hevy" },
    file: undefined,
  };
  const res = mockRes();

  await postTrainingHistory(req, res, makeNext());

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "missing_file");
});

test("import: valid CSV returns 200 with import_id and derived_anchor_lifts", async () => {
  const db = {
    async query(sql) {
      if (sql.includes("client_profile")) {
        return { rows: [{ id: "profile-uuid" }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const { postTrainingHistory } = createImportHandlers(db, {
    importService: {
      async processHevyCsv({ csvBuffer, userId, clientProfileId }) {
        assert.ok(Buffer.isBuffer(csvBuffer));
        assert.equal(userId, USER_UUID);
        assert.equal(clientProfileId, "profile-uuid");
        return {
          import_id: IMPORT_UUID,
          status: "completed",
          derived_anchor_lifts: [{
            family_slug: "squat",
            exercise_name: "Barbell Back Squat",
            weight_kg: 100,
            reps: 5,
            source: "history_import",
          }],
          warnings: [],
        };
      },
    },
  });

  const req = {
    auth: { user_id: USER_UUID },
    body: { source_app: "hevy" },
    file: { buffer: makeCsvBuffer("Barbell Back Squat") },
  };
  const res = mockRes();

  await postTrainingHistory(req, res, makeNext());

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.ok(typeof res.body?.import_id === "string");
  assert.ok(Array.isArray(res.body?.derived_anchor_lifts));
  assert.ok(Array.isArray(res.body?.warnings));
});

test("import GET: returns 404 for wrong user's import_id", async () => {
  const db = { async query() { return { rows: [] }; } };
  const { getImportRecord } = createImportHandlers(db, {
    importService: {
      async getImport() {
        return null;
      },
    },
  });

  const req = {
    auth: { user_id: USER_UUID },
    params: { import_id: IMPORT_UUID },
  };
  const res = mockRes();

  await getImportRecord(req, res, makeNext());

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.ok, false);
});

test("import: all-unmapped CSV returns completed_with_warnings and empty derived_anchor_lifts", async () => {
  const db = {
    async query(sql) {
      if (sql.includes("client_profile")) {
        return { rows: [{ id: "profile-uuid" }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const { postTrainingHistory } = createImportHandlers(db, {
    importService: {
      async processHevyCsv() {
        return {
          import_id: IMPORT_UUID,
          status: "completed_with_warnings",
          derived_anchor_lifts: [],
          warnings: [{
            code: "unmapped_exercise_name",
            message: "Could not map imported rows.",
          }],
        };
      },
    },
  });

  const req = {
    auth: { user_id: USER_UUID },
    body: { source_app: "hevy" },
    file: { buffer: makeCsvBuffer("Unknown Fancy Exercise XYZ") },
  };
  const res = mockRes();

  await postTrainingHistory(req, res, makeNext());

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body?.derived_anchor_lifts));
  assert.equal(res.body?.derived_anchor_lifts?.length ?? 0, 0);
  assert.ok(Array.isArray(res.body?.warnings));
  assert.ok((res.body?.warnings?.length ?? 0) > 0);
});
