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
    fields: Object.fromEntries(columns.map((column, i) => [column, values[i]])),
    rank: Number(values[4]), archived: values[5] === 'true',
    hyroxRole: columns.includes('hyrox_role') ? values[columns.indexOf('hyrox_role')] : undefined,
  };
}

function equipmentRows(sql = equipment) {
  // Both seed VALUES lists have one complete row per line. Quoted SQL tokens
  // handle embedded commas in raw_json and doubled apostrophes in names.
  return sql.split(/\r?\n/).filter(line => /^\s*\(\s*'/.test(line)).map(line => {
    const strings = [...line.matchAll(/'((?:''|[^'])*)'/g)].map(match => match[1].replace(/''/g, "'"));
    return { externalId: strings[0], category: strings[1], name: strings[2], slug: strings[3], raw: strings.length > 4 ? JSON.parse(strings.at(-1)) : null };
  });
}

const sqlText = literal => literal === 'NULL' ? null : literal.slice(1, -1).replace(/''/g, "'");
const equipmentSlugs = fields => fields.equipment_items_slugs === "'{}'::text[]" ? [] :
  [...fields.equipment_items_slugs.matchAll(/'((?:''|[^'])*)'/g)].map(match => match[1]);
const exerciseIds = [...catalogue.matchAll(/\) VALUES \(\r?\n  '([^']+)',/g)].map(match => match[1]);

test('bodyweight calf raises have optional load and dead tread still requires a treadmill', () => {
  const calf = exerciseValues('single_leg_standing_calf_raise').fields;
  assert.deepEqual(equipmentSlugs(calf), []);
  assert.equal(calf.equipment_json, "'[]'::jsonb");
  assert.equal(sqlText(calf.load_guidance), 'Hold a dumbbell for extra load once 20 controlled reps per side is easy.');
  assert.deepEqual(equipmentSlugs(exerciseValues('dead_tread').fields), ['treadmill']);
});

test('running space has an independent equipment code and battle rope spelling is corrected', () => {
  const rows = equipmentRows();
  const running = rows.find(row => row.externalId === '1771082757579x923243789917044700');
  assert.equal(running.slug, 'running_space');
  assert.equal(running.name, 'outdoor running space / track');
  assert.equal(running.raw.exercise_slug, running.slug);
  assert.equal(running.raw.name, running.name);
  assert.ok(rows.every(row => row.name !== 'batte rope' && row.raw?.name !== 'batte rope'));
  const rope = rows.find(row => row.slug === 'battle_rope');
  assert.equal(rope.name, 'battle rope');
  assert.equal(rope.raw.name, rope.name);
  const treadmill = rows.find(row => row.slug === 'treadmill');
  assert.equal(treadmill.category, 'Cardio machine');
  assert.equal(treadmill.raw.crossfit_hyrox_gym, 'no');
});

test('partner and duplicate exercises are archived and their replacements are active', () => {
  for (const id of ['wheelbarrow_pull', 'kb_swing_low']) assert.equal(exerciseValues(id).archived, true, id);
  for (const id of ['backward_bear_crawl', 'prone_lat_pulldown', 'band_rowing_stroke', 'sandbag_backward_drag']) {
    const row = exerciseValues(id);
    assert.equal(row.archived, false, id);
    assert.equal(row.rank, 0, id);
    assert.equal(row.fields.contraindications_json, "'[]'::jsonb", id);
    assert.equal(row.fields.contraindications_slugs, "'{}'::text[]", id);
  }
  assert.equal(exerciseValues('bear_crawl').rank, 0);
  assert.equal(exerciseValues('kb_swing').archived, false);
});

test('table row is horizontal and household load carry provides practical setup', () => {
  assert.equal(sqlText(exerciseValues('table_row').fields.movement_pattern_primary), 'pull_horizontal');
  const carry = exerciseValues('farmer_carry_weighted').fields;
  assert.equal(sqlText(carry.name), 'Household Load Carry');
  assert.match(sqlText(carry.technique_setup), /backpack, two shopping bags or two water jugs/);
  for (const oldName of ['Farmer Carry', 'Farmer Carry (weighted)']) {
    assert.ok(backfill.includes(`('farmer_carry_weighted', '${oldName}')`));
  }
});

test('active rower and ski stand-ins match their movement', () => {
  const violations = [];
  for (const id of exerciseIds) {
    const { fields, archived } = exerciseValues(id); if (archived) continue;
    const sw = sqlText(fields.swap_group_id_1), mp = sqlText(fields.movement_pattern_primary);
    if (sw === 'row_erg' && (!['cyclical_engine', 'pull_horizontal'].includes(mp) || /upright row/i.test(sqlText(fields.name)))) violations.push(id);
    if (sw === 'ski_erg' && ['anti_extension', 'push_horizontal'].includes(mp)) violations.push(id);
  }
  assert.deepEqual(violations, [], `Invalid erg stand-ins: ${violations.join(', ')}`);
});

test('active carries require equipment except the household load convention', () => {
  const violations = exerciseIds.filter(id => {
    const { fields, archived } = exerciseValues(id);
    // catalogue-data-error-fixes decision 1: household loads are available without gym equipment.
    return !archived && /carry/i.test(sqlText(fields.name)) && id !== 'farmer_carry_weighted' && !equipmentSlugs(fields).length;
  });
  assert.deepEqual(violations, [], `Carries without loads: ${violations.join(', ')}`);
});

test('sled-pull replacements accept distance while rowing complexes use time', () => {
  const whitelist = readMigration('R__seed_exercise_catalogue_distance_whitelist.sql');
  for (const id of ['backward_bear_crawl', 'sandbag_backward_drag', 'wheelbarrow_pull']) assert.ok(whitelist.includes(`'${id}'`));
  for (const id of ['rdl_and_bent_over_row', 'band_rowing_stroke']) assert.ok(!whitelist.includes(`'${id}'`));
});

test('equipment items have unique exercise slugs', () => {
  const counts = new Map();
  for (const row of equipmentRows()) counts.set(row.slug, (counts.get(row.slug) || 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count > 1);
  assert.deepEqual(duplicates, [], `Duplicate equipment codes: ${JSON.stringify(duplicates)}`);
});

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

test("snapshot orders exercises with the same class and name by exercise_id", () => {
  // Mirrors the generator's ORDER BY movement_class, name, exercise_id COLLATE "C".
  // Without the tie-break, Postgres returns tied rows in physical order and
  // /admin/sync-status flips between clean and dirty after a Flyway re-run.
  const blocks = [...catalogue.matchAll(/\) VALUES \(\r?\n  '([^']+)',\r?\n  '((?:''|[^'])*)',\r?\n  '([^']*)',/g)]
    .map(([, id, name, movementClass]) => ({ id, name, movementClass }));
  assert.ok(blocks.length > 0, "expected catalogue blocks");
  const misordered = blocks.slice(1).flatMap((block, i) => {
    const prev = blocks[i];
    return prev.movementClass === block.movementClass && prev.name === block.name && prev.id > block.id
      ? [`${prev.id} before ${block.id} (${block.movementClass} / ${block.name})`] : [];
  });
  assert.deepEqual(misordered, [], `Tied catalogue rows out of exercise_id order:\n${misordered.join("\n")}`);
  const deletion = catalogue.match(/NOT\s+IN\s*\(([\s\S]*?)\)\s*;/i);
  const listed = [...deletion[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(listed, blocks.map(block => block.id), "Step 1 NOT IN list should follow block order");
});
