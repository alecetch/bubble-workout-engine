import test from "node:test";
import assert from "node:assert/strict";
import { resolveExerciseLedHero } from "../exerciseLedHero.js";

const item = (id, extra = {}) => ({
  exercise_id: id, exercise_name: `Exercise ${id}`, purpose: "main", segment_type: "single",
  order_in_day: 1, still_image_is_placeholder: false,
  stillCardUrl: `https://cdn.test/${id}/still-card.webp`, stillImageUrl: `https://cdn.test/${id}/still.jpg`,
  stillThumbhash: `hash-${id}`, ...extra,
});
const resolve = (items, weekNumber = 1, dayType = "hypertrophy") => resolveExerciseLedHero({ dayType, weekNumber, items });

test("orders main candidates before secondary, rotates weekly and does not mutate inputs", () => {
  const items = [item("secondary", { purpose: "secondary", order_in_day: 1 }), item("later-main", { order_in_day: 3 }), item("first-main", { order_in_day: 2 })];
  assert.deepEqual(resolve(items), { exercise_id: "first-main", exercise_name: "Exercise first-main", url: items[2].stillCardUrl, thumbhash: "hash-first-main" });
  assert.equal(resolve(items, 2).exercise_id, "later-main");
  assert.equal(resolve(items, 3).exercise_id, "secondary");
  assert.deepEqual(items.map(row => row.exercise_id), ["secondary", "later-main", "first-main"]);
  assert.equal(resolve(items.slice(1), 5).exercise_id, "first-main");
});

test("skips placeholders, including an inconsistent flag on a placeholder key/URL", () => {
  for (const bad of [
    { still_image_is_placeholder: true }, { still_image_is_placeholder: undefined },
    { still_image_key: "exercise-media/_placeholder/still.jpg" },
    { stillImageUrl: "https://cdn.test/exercise-media/_placeholder/still.jpg" },
  ]) assert.equal(resolve([item("bad", bad), item("real")]).exercise_id, "real");
});

test("only allows single/superset/strength main or secondary exercises", () => {
  for (const segment_type of ["amrap", "emom", "circuit", "warmup", "cooldown", "giant_set"]) {
    assert.equal(resolve([item("bad", { segment_type }), item("real")]).exercise_id, "real");
  }
  for (const purpose of ["warmup", "cooldown", "accessory", undefined]) {
    assert.equal(resolve([item("bad", { purpose }), item("real")]).exercise_id, "real");
  }
  for (const segment_type of ["single", "superset", "strength"]) assert.equal(resolve([item("ok", { segment_type })]).exercise_id, "ok");
});

test("falls back to secondary and counts each exercise only once", () => {
  assert.equal(resolve([item("bad", { still_image_is_placeholder: true }), item("secondary", { purpose: "secondary" })]).exercise_id, "secondary");
  const duplicate = [item("a"), item("a", { order_in_day: 2, exercise_name: "Duplicate" }), item("b", { purpose: "secondary", order_in_day: 3 })];
  assert.equal(resolve(duplicate, 2).exercise_id, "b");
  assert.equal(resolve(duplicate, 3).exercise_name, "Exercise a");
});

for (const dayType of ["conditioning", "hyrox", "simulation", "recovery"]) {
  test(`${dayType} retains curated art`, () => assert.equal(resolve([item("a")], 1, dayType), null));
}

test("returns null without qualifying usable media and falls back to the original still", () => {
  assert.equal(resolve([]), null);
  assert.equal(resolve([item("a", { stillCardUrl: null, stillImageUrl: null })]), null);
  assert.deepEqual(resolve([item("a", { stillCardUrl: null, stillThumbhash: undefined })]), {
    exercise_id: "a", exercise_name: "Exercise a", url: "https://cdn.test/a/still.jpg", thumbhash: null,
  });
});

test("normalizes missing, zero, string and invalid week numbers", () => {
  const items = [item("a"), item("b", { order_in_day: 2 })];
  for (const week of [null, 0, -1, "bad", Infinity]) assert.equal(resolve(items, week).exercise_id, "a");
  assert.equal(resolve(items, "2").exercise_id, "b");
});
