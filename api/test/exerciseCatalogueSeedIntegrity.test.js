import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Repo checkout (CI, host): <repo>/migrations. Docker Compose api container: mounted at /app/migrations.
const MIGRATIONS_DIR = [new URL("../../migrations/", import.meta.url), new URL("../migrations/", import.meta.url)]
  .find(dir => existsSync(dir));
const readMigration = file => readFileSync(new URL(file, MIGRATIONS_DIR), "utf8");
const catalogue = readMigration("R__exercise_catalogue_edits.sql");
const backfill = readMigration("R__exercise_catalogue_zz_sync_program_exercise_names.sql");
const equipment = readMigration("R__seed_equipment_items.sql");

function exerciseValues(id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...catalogue.matchAll(new RegExp(`INSERT INTO (?:public\\.)?exercise_catalogue \\(\\s*([^)]*)\\) VALUES \\(\\r?\\n  '${escapedId}',([\\s\\S]*?)\\r?\\n\\)\\r?\\nON CONFLICT`, 'g'))];
  assert.equal(blocks.length, 1, `Expected one INSERT block for ${id}`);
  const columns = blocks[0][1].split(',').map(column => column.trim());
  // Each SQL value occupies its own line. Never split on commas, which may
  // occur inside quoted names, ARRAY[...] expressions, or JSON values.
  const values = [`'${id}'`, ...blocks[0][2].trim().split(/\r?\n/).map(line => line.trim().replace(/,$/, ''))];
  assert.equal(values.length, columns.length, `Column/value mismatch for ${id}`);
  return {
    rank: Number(values[4]), archived: values[5] === 'true',
    hyroxRole: columns.includes('hyrox_role') ? values[columns.indexOf('hyrox_role')] : undefined,
  };
}

test('catalogue fitness ranks match all confirmed corrections', () => {
  const expected = Object.fromEntries([
    ...'lat_pulldown leg_press machine_chest_press machine_shoulder_press lying_leg_curl seated_leg_curl seated_calf_raise standing_calf_raise cable_curl pushdown face_pull cable_lateral_raise cable_fly row_erg ski_erg bike_erg air_bike_sprint sled_push sled_pull wall_ball sandbag_lunge sandbag_frontrack_lunge medball_slam pushup trap_bar_deadlift burpee pike_shoulder_taps kb_swing'.split(' ').map(id => [id, 0]),
    ['feetelevated_pushup', 1], ['pike_push_up', 1], ['weighted_pushup', 2], ['nordic_hamstring_curl', 2],
  ]);
  const mismatches = Object.entries(expected).flatMap(([id, rank]) => {
    const actual = exerciseValues(id).rank;
    return actual === rank ? [] : [`${id}: expected ${rank}, got ${actual}`];
  });
  assert.deepEqual(mismatches, [], `Fitness-rank mismatches:\n${mismatches.join('\n')}`);
});

test('HYROX race stations and ergs are beginner-eligible', () => {
  // hyrox_role is assigned by other seeds, so check the agreed station IDs directly.
  const ids = 'row_erg ski_erg bike_erg air_bike_sprint sled_push sled_pull wall_ball sandbag_lunge sandbag_frontrack_lunge medball_slam'.split(' ');
  const mismatches = ids.filter(id => exerciseValues(id).rank !== 0);
  assert.deepEqual(mismatches, [], `Stations not eligible at rank 0: ${mismatches.join(', ')}`);
});

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
