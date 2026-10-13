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

const strengthAssets = [
  { id: "strength_program", usage_scope: "program", day_type: "strength", focus_type: null },
  ...["lower_body", "upper_body", "full_body"].map(focus_type => ({
    id: `strength_${focus_type}`, usage_scope: "program_day", day_type: "strength", focus_type,
  })),
  ...["program", "program_day"].map(usage_scope => ({
    id: `generic_${usage_scope}`, usage_scope, day_type: "generic", focus_type: null,
  })),
];

for (const focus of ["lower_body", "upper_body", "full_body"]) {
  test(`strength ${focus} resolves to its matching strength row`, () => {
    assert.equal(resolveHeroMediaRow(strengthAssets, "program_day", "strength", focus)?.id, `strength_${focus}`);
  });
}

test("strength program resolves to its program row", () => {
  assert.equal(resolveHeroMediaRow(strengthAssets, "program", "strength", null)?.id, "strength_program");
});

for (const scope of ["program", "program_day"]) {
  test(`HYROX resolves to generic in ${scope} scope`, () => {
    assert.equal(resolveHeroMediaRow(strengthAssets, scope, "hyrox", "lower_body")?.id, `generic_${scope}`);
  });
}

test("unknown type without generic returns null rather than the first row", () => {
  assert.equal(resolveHeroMediaRow(assets.filter(a => a.day_type !== "generic"), "program_day", "hyrox", "upper_body"), null);
});

test("inactive exact and generic rows are never returned", () => {
  const inactive = strengthAssets.map(a => ({ ...a, is_active: false }));
  assert.equal(resolveHeroMediaRow(inactive, "program_day", "strength", "lower_body"), null);
  assert.equal(resolveHeroMediaRow(inactive, "program", "hyrox", null), null);
  assert.equal(resolveHeroMediaRow([...inactive, assets[3]], "program_day", "strength", "lower_body")?.id, "4");
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
