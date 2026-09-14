import test from "node:test";
import assert from "node:assert/strict";
import { applyNarration } from "../05_applyNarration.js";

const templates = [
  { template_id: "program_title", scope: "program", field: "PROGRAM_TITLE", priority: 1, text_pool_json: ["Program"] },
];

function ex(id, regions) {
  return {
    ex_id: id,
    ex_name: id,
    sets: 3,
    reps_prescribed: "8",
    reps_unit: "reps",
  };
}

function segment(purpose, items) {
  return { purpose, segment_type: "single", rounds: 1, items };
}

function warmup(id, regions, equipment = [], rounds = 1) {
  return {
    warmup_exercise_id: id,
    name: id,
    target_regions_json: regions,
    equipment_items_slugs: equipment,
    cue_text: `${id} cue`,
    duration_or_reps_label: "10 reps",
    rounds,
  };
}

async function narrate({ weeks, catalog, warmupCatalog, warmupHistory = {}, effectiveEquipment = [] }) {
  return applyNarration({
    program: { program_type: "hypertrophy", duration_mins: 50, days_per_week: 1, weeks },
    narrationTemplates: templates,
    narrationSource: "db",
    programGenerationConfigJson: {},
    fitnessRank: 1,
    programLength: weeks.length,
    catalogJson: { ex: catalog },
    warmupCatalog,
    warmupHistory,
    effectiveEquipment,
  });
}

function warmupItems(out, weekIndex = 0, dayIndex = 0) {
  return out.program.weeks[weekIndex].days[dayIndex].segments.find((seg) => seg.segment_type === "warmup").items;
}

test("applyNarration caps warm-up selections at five regions in segment priority order", async () => {
  const catalog = [
    { id: "main-a", tr: ["quads", "glutes", "hamstrings"] },
    { id: "secondary-a", tr: ["chest", "shoulders"] },
    { id: "accessory-a", tr: ["lats", "core"] },
  ];
  const warmupCatalog = ["quads", "glutes", "hamstrings", "chest", "shoulders", "lats", "core"]
    .map((region) => warmup(`warmup-${region}`, [region]));
  const out = await narrate({
    catalog,
    warmupCatalog,
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [
      segment("accessory", [ex("accessory-a")]),
      segment("secondary", [ex("secondary-a")]),
      segment("main", [ex("main-a")]),
    ] }] }],
  });

  assert.deepEqual(warmupItems(out).map((item) => item.exercise_id), [
    "warmup-quads",
    "warmup-glutes",
    "warmup-hamstrings",
    "warmup-chest",
    "warmup-shoulders",
  ]);
});

test("applyNarration respects equipment containment", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["glutes"] }],
    warmupCatalog: [
      warmup("glute-bodyweight", ["glutes"]),
      warmup("glute-band", ["glutes"], ["band"]),
    ],
    effectiveEquipment: [],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  });

  assert.equal(warmupItems(out)[0].exercise_id, "glute-bodyweight");
});

test("applyNarration excludes recent warm-ups when possible and falls back when needed", async () => {
  const base = {
    catalog: [{ id: "main-a", tr: ["glutes"] }],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  };
  const excluded = await narrate({
    ...base,
    warmupCatalog: [warmup("glute-a", ["glutes"]), warmup("glute-b", ["glutes"])],
    warmupHistory: { glutes: ["glute-a"] },
  });
  assert.equal(warmupItems(excluded)[0].exercise_id, "glute-b");

  const fallback = await narrate({
    ...base,
    warmupCatalog: [warmup("glute-a", ["glutes"])],
    warmupHistory: { glutes: ["glute-a"] },
  });
  assert.equal(warmupItems(fallback)[0].exercise_id, "glute-a");
});

test("applyNarration avoids in-run repeats across generated weeks when alternatives exist", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["glutes"] }],
    warmupCatalog: [warmup("glute-a", ["glutes"]), warmup("glute-b", ["glutes"])],
    weeks: [
      { week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] },
      { week_index: 2, days: [{ week_index: 2, day_index: 1, program_day_key: "W2D1", segments: [segment("main", [ex("main-a")])] }] },
    ],
  });

  assert.notEqual(warmupItems(out, 0, 0)[0].exercise_id, warmupItems(out, 1, 0)[0].exercise_id);
});

test("applyNarration folds unavoidable same-day warm-up duplicates into one card", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["chest", "shoulders"] }],
    warmupCatalog: [warmup("scap-push-up", ["chest", "shoulders"], [], 2)],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  });

  const items = warmupItems(out);
  assert.equal(items.filter((item) => item.exercise_id === "scap-push-up").length, 1);
  assert.equal(items[0].exercise_id, "scap-push-up");
  assert.equal(items[0].sets_prescribed, 4);
});

test("applyNarration prefers distinct same-day warm-up exercises when an eligible alternative exists", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["chest", "shoulders"] }],
    warmupCatalog: [
      warmup("scap-push-up", ["chest", "shoulders"]),
      warmup("wall-slide", ["shoulders"]),
    ],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  });

  const ids = warmupItems(out).map((item) => item.exercise_id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(warmupItems(out).map((item) => item.sets_prescribed), [1, 1]);
});

test("applyNarration caps folded same-day warm-up duplicate rounds at four", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["chest", "shoulders", "upper_back", "triceps", "arms"] }],
    warmupCatalog: [warmup("single-multi-region", ["chest", "shoulders", "upper_back", "triceps", "arms"], [], 1)],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  });

  const items = warmupItems(out);
  assert.equal(items.length, 1);
  assert.equal(items[0].exercise_id, "single-multi-region");
  assert.equal(items[0].sets_prescribed, 4);
});
