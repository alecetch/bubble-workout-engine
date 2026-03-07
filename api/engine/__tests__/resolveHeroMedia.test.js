import test from "node:test";
import assert from "node:assert/strict";
import { dayFocusSlug, resolveHeroMediaRow, toHeroMediaObject } from "../resolveHeroMedia.js";

function makeDay(slot) {
  return {
    segments: [
      {
        purpose: "main",
        items: [{ slot }],
      },
    ],
  };
}

const assets = [
  { id: "1", usage_scope: "program_day", day_type: "hypertrophy", focus_type: "upper_body", image_key: "u.jpg", image_url: "", sort_order: 1 },
  { id: "2", usage_scope: "program_day", day_type: "hypertrophy", focus_type: "full_body", image_key: "f.jpg", image_url: "", sort_order: 2 },
  { id: "3", usage_scope: "program_day", day_type: "hypertrophy", focus_type: null, image_key: "p.jpg", image_url: "", sort_order: 3 },
  { id: "4", usage_scope: "program_day", day_type: "generic", focus_type: null, image_key: "g.jpg", image_url: "", sort_order: 4 },
  { id: "5", usage_scope: "other_scope", day_type: "hypertrophy", focus_type: "upper_body", image_key: "x.jpg", image_url: "", sort_order: 1 },
];

test("dayFocusSlug maps squat/hinge/lunge to lower_body", () => {
  assert.equal(dayFocusSlug(makeDay("main_squat")), "lower_body");
  assert.equal(dayFocusSlug(makeDay("main_hinge")), "lower_body");
  assert.equal(dayFocusSlug(makeDay("main_lunge")), "lower_body");
});

test("dayFocusSlug maps push/pull to upper_body", () => {
  assert.equal(dayFocusSlug(makeDay("push_horizontal")), "upper_body");
  assert.equal(dayFocusSlug(makeDay("pull_vertical")), "upper_body");
});

test("dayFocusSlug returns full_body when no main segment", () => {
  assert.equal(dayFocusSlug({ segments: [{ purpose: "secondary", items: [{ slot: "push_horizontal" }] }] }), "full_body");
});

test("dayFocusSlug returns full_body for unknown slot", () => {
  assert.equal(dayFocusSlug(makeDay("carry")), "full_body");
});

test("resolveHeroMediaRow exact match wins", () => {
  const row = resolveHeroMediaRow(assets, "program_day", "hypertrophy", "upper_body");
  assert.equal(row?.id, "1");
});

test("resolveHeroMediaRow falls back to full_body focus", () => {
  const row = resolveHeroMediaRow(assets, "program_day", "hypertrophy", "lower_body");
  assert.equal(row?.id, "2");
});

test("resolveHeroMediaRow falls back to no-focus row", () => {
  const row = resolveHeroMediaRow(assets, "program_day", "hypertrophy", null);
  assert.equal(row?.id, "3");
});

test("resolveHeroMediaRow falls back to generic", () => {
  const row = resolveHeroMediaRow(
    [{ id: "4", usage_scope: "program_day", day_type: "generic", focus_type: null, image_key: "g.jpg", image_url: "" }],
    "program_day",
    "hypertrophy",
    "upper_body",
  );
  assert.equal(row?.id, "4");
});

test("resolveHeroMediaRow returns null for empty assets", () => {
  assert.equal(resolveHeroMediaRow([], "program_day", "hypertrophy", "upper_body"), null);
});

test("resolveHeroMediaRow does not cross usage_scope", () => {
  const row = resolveHeroMediaRow(
    [{ id: "5", usage_scope: "other_scope", day_type: "hypertrophy", focus_type: "upper_body" }],
    "program_day",
    "hypertrophy",
    "upper_body",
  );
  assert.equal(row, null);
});

test("resolveHeroMediaRow is deterministic for same input", () => {
  const rowA = resolveHeroMediaRow(assets, "program_day", "hypertrophy", "upper_body");
  const rowB = resolveHeroMediaRow(assets, "program_day", "hypertrophy", "upper_body");
  assert.equal(rowA?.id, rowB?.id);
});

test("toHeroMediaObject returns null for null row", () => {
  assert.equal(toHeroMediaObject(null), null);
});

test("toHeroMediaObject returns id, image_key, image_url", () => {
  const oldBase = process.env.S3_PUBLIC_BASE_URL;
  process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.com";
  try {
    const out = toHeroMediaObject({
      id: 7,
      image_key: "hero/day.jpg",
      image_url: "",
    });
    assert.deepEqual(out, {
      id: "7",
      image_key: "hero/day.jpg",
      image_url: "https://cdn.example.com/hero/day.jpg",
    });
  } finally {
    process.env.S3_PUBLIC_BASE_URL = oldBase;
  }
});
