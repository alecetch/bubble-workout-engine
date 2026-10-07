import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readMigration = file => readFileSync(new URL(`../../migrations/${file}`, import.meta.url), "utf8");
const catalogue = readMigration("R__exercise_catalogue_edits.sql");
const backfill = readMigration("R__exercise_catalogue_zz_sync_program_exercise_names.sql");
const equipment = readMigration("R__seed_equipment_items.sql");

function missingProtectedIds(sql) {
  const deletion = sql.match(/DELETE\s+FROM\s+(?:public\.)?exercise_catalogue\s+WHERE\s+exercise_id\s+NOT\s+IN\s*\(([\s\S]*?)\)\s*;/i);
  assert.ok(deletion, "expected the snapshot's Step 1 NOT IN deletion safeguard");
  const protectedIds = new Set([...deletion[1].matchAll(/'([^']+)'/g)].map(match => match[1]));
  const insertedIds = [...sql.matchAll(/INSERT\s+INTO\s+(?:public\.)?exercise_catalogue\s*\(\s*exercise_id\b[^)]*\)\s*VALUES\s*\(\s*'([^']+)'/gi)].map(match => match[1]);
  assert.ok(insertedIds.length > 0, "expected exercise catalogue INSERTs");
  return [...new Set(insertedIds.filter(id => !protectedIds.has(id)))];
}

test("all inserted catalogue IDs are protected from snapshot deletion", () => {
  const missing = missingProtectedIds(catalogue);
  assert.deepEqual(missing, [], `INSERT IDs missing from NOT IN: ${missing.join(", ")}`);
});

test("deletion safeguard check detects a missing kettlebell clone", () => {
  const changed = catalogue.replace(/(NOT\s+IN\s*\()([\s\S]*?)(\)\s*;)/i, (_, start, ids, end) =>
    start + ids.replace(/\s*'kb_goblet_squat'\s*,/, "") + end);
  assert.notEqual(changed, catalogue, "mutation must remove the clone from NOT IN");
  assert.deepEqual(missingProtectedIds(changed), ["kb_goblet_squat"]);
});

test("all program-name backfill IDs exist in the catalogue seed", () => {
  const values = backfill.match(/\(VALUES([\s\S]*?)\)\s+AS\s+renamed\b/i);
  assert.ok(values, "expected renamed VALUES list");
  const ids = [...values[1].matchAll(/\(\s*'([^']+)'\s*,\s*'(?:''|[^'])*'\s*\)/g)].map(match => match[1]);
  assert.ok(ids.length > 0, "expected backfill IDs");
  const missing = ids.filter(id => !catalogue.includes(`'${id}'`));
  assert.deepEqual(missing, [], `Backfill IDs missing from catalogue: ${missing.join(", ")}`);
});

test("equipment seed has exactly one resistance band and row machine slug", () => {
  // The first four VALUES fields are external_id, category, name, exercise_slug.
  // Match row starts, rather than the duplicate slug strings in raw_json.
  const slugs = [...equipment.matchAll(/^\s*\(\s*'(?:''|[^'])*'\s*,\s*'(?:''|[^'])*'\s*,\s*'(?:''|[^'])*'\s*,\s*'((?:''|[^'])*)'\s*,/gm)].map(match => match[1]);
  for (const slug of ["resistance_band", "row_machine"]) {
    assert.equal(slugs.filter(value => value === slug).length, 1, `expected exactly one equipment row for ${slug}`);
  }
});
