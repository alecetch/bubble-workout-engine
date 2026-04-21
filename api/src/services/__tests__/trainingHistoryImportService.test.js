import test from "node:test";
import assert from "node:assert/strict";
import {
  makeTrainingHistoryImportService,
  normalizeExerciseName,
  pickBestWorkingSet,
} from "../trainingHistoryImportService.js";

function csv(lines) {
  return Buffer.from(lines.join("\n"), "utf8");
}

function createDb({ aliases = [], importId = "import-1", getImportRow = null, savedAnchors = [] } = {}) {
  const traces = [];
  const db = {
    traces,
    async query(sql, params) {
      if (sql.includes("FROM exercise_catalogue")) {
        return { rows: [] };
      }
      if (sql.includes("FROM exercise_import_alias")) {
        return { rows: aliases };
      }
      if (sql.includes("INSERT INTO training_history_import_row")) {
        traces.push(params);
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO training_history_import")) {
        return { rows: [{ id: importId }] };
      }
      if (sql.includes("UPDATE training_history_import")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO client_anchor_lift")) {
        return { rows: [{ id: "anchor-1", source: params[7] }] };
      }
      if (sql.includes("SELECT source FROM client_anchor_lift")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT id, source_app, status, summary_json, created_at, completed_at")) {
        return { rows: getImportRow ? [getImportRow] : [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return db;
}

test("normalizeExerciseName lowercases and compresses whitespace", () => {
  assert.equal(normalizeExerciseName("  Barbell   Back Squat "), "barbell back squat");
});

test("pickBestWorkingSet prefers heaviest, then more recent, then reps closer to 5", () => {
  const best = pickBestWorkingSet([
    { weight_kg: 100, reps: 8, performed_at: "2026-04-01" },
    { weight_kg: 100, reps: 5, performed_at: "2026-04-01" },
    { weight_kg: 100, reps: 6, performed_at: "2026-04-02" },
    { weight_kg: 105, reps: 13, performed_at: "2026-04-03" },
  ]);
  assert.equal(best.weight_kg, 100);
  assert.equal(best.performed_at, "2026-04-02");
});

test("valid Hevy CSV derives anchors and completes import", async () => {
  const db = createDb({
    aliases: [
      {
        source_name_normalized: "barbell back squat",
        exercise_id: "bb_back_squat",
        estimation_family: "squat",
      },
      {
        source_name_normalized: "barbell bench press",
        exercise_id: "bb_bench_press_flat",
        estimation_family: "horizontal_press",
      },
    ],
  });
  const service = makeTrainingHistoryImportService(db, { now: () => new Date("2026-04-15T12:00:00Z") });

  const result = await service.processHevyCsv({
    csvBuffer: csv([
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps",
      "2026-04-10,Day 1,Barbell Back Squat,1,100,5",
      "2026-04-12,Day 2,Barbell Bench Press,1,70,6",
    ]),
    userId: "user-1",
    clientProfileId: "profile-1",
  });

  assert.equal(result.status, "completed");
  assert.equal(result.derived_anchor_lifts.length, 2);
  assert.equal(result.derived_anchor_lifts[0].source, "history_import");
  assert.ok("family_slug" in result.derived_anchor_lifts[0]);
  assert.ok("weight_kg" in result.derived_anchor_lifts[0]);
  assert.ok("exercise_name" in result.derived_anchor_lifts[0]);
});

test("malformed CSV missing Hevy headers throws csv_parse_error", async () => {
  const service = makeTrainingHistoryImportService(createDb(), { now: () => new Date("2026-04-15T12:00:00Z") });

  await assert.rejects(
    service.processHevyCsv({
      csvBuffer: csv([
        "foo,bar,baz",
        "1,2,3",
      ]),
      userId: "user-1",
      clientProfileId: "profile-1",
    }),
    (err) => err.code === "csv_parse_error",
  );
});

test("empty file after header fails with no derived anchors", async () => {
  const service = makeTrainingHistoryImportService(createDb(), { now: () => new Date("2026-04-15T12:00:00Z") });

  const result = await service.processHevyCsv({
    csvBuffer: csv([
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps",
    ]),
    userId: "user-1",
    clientProfileId: "profile-1",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.derived_anchor_lifts.length, 0);
});

test("rows older than 90 days are excluded but boundary rows are included", async () => {
  const db = createDb({
    aliases: [
      {
        source_name_normalized: "barbell back squat",
        exercise_id: "bb_back_squat",
        estimation_family: "squat",
      },
    ],
  });
  const service = makeTrainingHistoryImportService(db, { now: () => new Date("2026-04-15T12:00:00Z") });

  const result = await service.processHevyCsv({
    csvBuffer: csv([
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps",
      "2026-01-14,Old,Barbell Back Squat,1,120,5",
      "2026-01-15,Boundary,Barbell Back Squat,1,100,5",
    ]),
    userId: "user-1",
    clientProfileId: "profile-1",
  });

  assert.equal(result.status, "completed");
  assert.equal(result.derived_anchor_lifts[0].weight_kg, 100);
});

test("best-working-set heuristic excludes zero-weight and out-of-range reps", async () => {
  const db = createDb({
    aliases: [
      {
        source_name_normalized: "barbell back squat",
        exercise_id: "bb_back_squat",
        estimation_family: "squat",
      },
    ],
  });
  const service = makeTrainingHistoryImportService(db, { now: () => new Date("2026-04-15T12:00:00Z") });

  const result = await service.processHevyCsv({
    csvBuffer: csv([
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps",
      "2026-04-10,Day 1,Barbell Back Squat,1,0,5",
      "2026-04-11,Day 1,Barbell Back Squat,1,120,2",
      "2026-04-12,Day 1,Barbell Back Squat,1,110,8",
      "2026-04-13,Day 1,Barbell Back Squat,1,110,5",
    ]),
    userId: "user-1",
    clientProfileId: "profile-1",
  });

  assert.equal(result.derived_anchor_lifts[0].weight_kg, 110);
  assert.equal(result.derived_anchor_lifts[0].reps, 5);
});

test("unmapped exercise names yield warnings and completed_with_warnings status when at least one family maps", async () => {
  const db = createDb({
    aliases: [
      {
        source_name_normalized: "barbell back squat",
        exercise_id: "bb_back_squat",
        estimation_family: "squat",
      },
    ],
  });
  const service = makeTrainingHistoryImportService(db, { now: () => new Date("2026-04-15T12:00:00Z") });

  const result = await service.processHevyCsv({
    csvBuffer: csv([
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps",
      "2026-04-10,Day 1,Barbell Back Squat,1,100,5",
      "2026-04-10,Day 1,Weird Exercise Name,1,50,10",
    ]),
    userId: "user-1",
    clientProfileId: "profile-1",
  });

  assert.equal(result.status, "completed_with_warnings");
  assert.equal(result.warnings.some((warning) => warning.code === "unmapped_exercise_name"), true);
});

test("getImport returns a user-scoped import record", async () => {
  const service = makeTrainingHistoryImportService(
    createDb({
      getImportRow: {
        id: "import-1",
        source_app: "hevy",
        status: "completed",
        summary_json: { total_rows: 2 },
        created_at: "2026-04-15T12:00:00Z",
        completed_at: "2026-04-15T12:05:00Z",
      },
    }),
  );

  const record = await service.getImport("import-1", "user-1");
  assert.equal(record.id, "import-1");
  assert.equal(record.status, "completed");
});

test("best working set row is flagged with is_best_set trace metadata", async () => {
  const db = createDb({
    aliases: [
      {
        source_name_normalized: "barbell back squat",
        exercise_id: "bb_back_squat",
        estimation_family: "squat",
      },
    ],
  });
  const service = makeTrainingHistoryImportService(db, { now: () => new Date("2026-04-15T12:00:00Z") });

  await service.processHevyCsv({
    csvBuffer: csv([
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps",
      "2026-04-10,Day 1,Barbell Back Squat,1,100,8",
      "2026-04-11,Day 1,Barbell Back Squat,1,110,5",
    ]),
    userId: "user-1",
    clientProfileId: "profile-1",
  });

  assert.equal(db.traces.length, 2);
  assert.equal(db.traces[0][9], false);
  assert.equal(db.traces[1][9], true);
});
