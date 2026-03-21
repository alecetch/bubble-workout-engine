import test from "node:test";
import assert from "node:assert/strict";
import { validateExecutableSql } from "../adminExerciseCatalogue.js";

function assertAllowed(sql) {
  assert.deepEqual(validateExecutableSql(sql), { ok: true });
}

function assertBlocked(sql) {
  const result = validateExecutableSql(sql);
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.ok(result.error.length > 0);
}

test("INSERT INTO exercise_catalogue is allowed", () => {
  assertAllowed("INSERT INTO exercise_catalogue (exercise_id) VALUES ('x')");
});

test("UPDATE exercise_catalogue is allowed", () => {
  assertAllowed("UPDATE exercise_catalogue SET name = 'foo' WHERE exercise_id = 'x'");
});

test("DELETE FROM exercise_catalogue is allowed", () => {
  assertAllowed("DELETE FROM exercise_catalogue WHERE exercise_id = 'x'");
});

test("trailing semicolon is stripped and allowed", () => {
  assertAllowed("DELETE FROM exercise_catalogue WHERE exercise_id = 'x';");
});

test("empty string is rejected", () => {
  assertBlocked("");
});

test("DROP TABLE is blocked", () => {
  assertBlocked("DROP TABLE exercise_catalogue");
});

test("TRUNCATE is blocked", () => {
  assertBlocked("TRUNCATE exercise_catalogue");
});

test("GRANT is blocked", () => {
  assertBlocked("GRANT ALL ON exercise_catalogue TO public");
});

test("REVOKE is blocked", () => {
  assertBlocked("REVOKE ALL ON exercise_catalogue FROM public");
});

test("COPY is blocked", () => {
  assertBlocked("COPY exercise_catalogue FROM '/tmp/evil'");
});

test("inline comment (--) is blocked", () => {
  assertBlocked("DELETE FROM exercise_catalogue WHERE exercise_id = 'x' -- injected");
});

test("block comment is blocked", () => {
  assertBlocked("DELETE FROM exercise_catalogue /* comment */ WHERE exercise_id = 'x'");
});

test("multi-statement (semicolon in middle) is blocked", () => {
  assertBlocked("DELETE FROM exercise_catalogue WHERE exercise_id = 'x'; DROP TABLE users");
});

test("INSERT on a different table is blocked", () => {
  assertBlocked("INSERT INTO users (id) VALUES ('admin')");
});

test("UPDATE on a different table is blocked", () => {
  assertBlocked("UPDATE app_user SET bubble_user_id = 'hacked'");
});

test("SELECT is blocked", () => {
  assertBlocked("SELECT * FROM exercise_catalogue");
});
