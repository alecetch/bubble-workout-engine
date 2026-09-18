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

function cooldown(id, regions, equipment = [], rounds = 1) {
  return {
    cooldown_exercise_id: id,
    name: id,
    target_regions_json: regions,
    equipment_items_slugs: equipment,
    cue_text: `${id} cue`,
    duration_or_reps_label: "30 sec",
    rounds,
  };
}

async function narrate({ weeks, catalog, cooldownCatalog, cooldownHistory = {}, warmupCatalog = [], warmupHistory = {}, effectiveEquipment = [] }) {
  return applyNarration({
    program: { program_type: "hypertrophy", duration_mins: 50, days_per_week: 1, weeks },
    narrationTemplates: templates,
    narrationSource: "db",
    programGenerationConfigJson: {},
    fitnessRank: 1,
    programLength: weeks.length,
    catalogJson: { ex: catalog },
    cooldownCatalog,
    cooldownHistory,
    warmupCatalog,
    warmupHistory,
    effectiveEquipment,
  });
}

function cooldownItems(out, weekIndex = 0, dayIndex = 0) {
  return out.program.weeks[weekIndex].days[dayIndex].segments.find((seg) => seg.segment_type === "cooldown").items;
}

test("applyNarration caps cool-down selections at five regions in segment priority order", async () => {
  const catalog = [
    { id: "main-a", tr: ["quads", "glutes", "hamstrings"] },
    { id: "secondary-a", tr: ["chest", "shoulders"] },
    { id: "accessory-a", tr: ["lats", "core"] },
  ];
  const cooldownCatalog = ["quads", "glutes", "hamstrings", "chest", "shoulders", "lats", "core"]
    .map((region) => cooldown(`cooldown-${region}`, [region]));
  const out = await narrate({
    catalog,
    cooldownCatalog,
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [
      segment("accessory", [ex("accessory-a")]),
      segment("secondary", [ex("secondary-a")]),
      segment("main", [ex("main-a")]),
    ] }] }],
  });

  assert.deepEqual(cooldownItems(out).map((item) => item.exercise_id), [
    "cooldown-quads",
    "cooldown-glutes",
    "cooldown-hamstrings",
    "cooldown-chest",
    "cooldown-shoulders",
  ]);
});

test("applyNarration respects equipment containment", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["glutes"] }],
    cooldownCatalog: [
      cooldown("glute-bodyweight", ["glutes"]),
      cooldown("glute-band", ["glutes"], ["band"]),
    ],
    effectiveEquipment: [],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  });

  assert.equal(cooldownItems(out)[0].exercise_id, "glute-bodyweight");
});

test("applyNarration excludes recent cool-downs when possible and falls back when needed", async () => {
  const base = {
    catalog: [{ id: "main-a", tr: ["glutes"] }],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  };
  const excluded = await narrate({
    ...base,
    cooldownCatalog: [cooldown("glute-a", ["glutes"]), cooldown("glute-b", ["glutes"])],
    cooldownHistory: { glutes: ["glute-a"] },
  });
  assert.equal(cooldownItems(excluded)[0].exercise_id, "glute-b");

  const fallback = await narrate({
    ...base,
    cooldownCatalog: [cooldown("glute-a", ["glutes"])],
    cooldownHistory: { glutes: ["glute-a"] },
  });
  assert.equal(cooldownItems(fallback)[0].exercise_id, "glute-a");
});

test("applyNarration avoids in-run repeats across generated weeks when alternatives exist", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["glutes"] }],
    cooldownCatalog: [cooldown("glute-a", ["glutes"]), cooldown("glute-b", ["glutes"])],
    weeks: [
      { week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] },
      { week_index: 2, days: [{ week_index: 2, day_index: 1, program_day_key: "W2D1", segments: [segment("main", [ex("main-a")])] }] },
    ],
  });

  assert.notEqual(cooldownItems(out, 0, 0)[0].exercise_id, cooldownItems(out, 1, 0)[0].exercise_id);
});

test("applyNarration folds unavoidable same-day cool-down duplicates into one card", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["chest", "shoulders"] }],
    cooldownCatalog: [cooldown("scap-push-up", ["chest", "shoulders"], [], 2)],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  });

  const items = cooldownItems(out);
  assert.equal(items.filter((item) => item.exercise_id === "scap-push-up").length, 1);
  assert.equal(items[0].exercise_id, "scap-push-up");
  assert.equal(items[0].sets_prescribed, 4);
});

test("applyNarration prefers distinct same-day cool-down exercises when an eligible alternative exists", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["chest", "shoulders"] }],
    cooldownCatalog: [
      cooldown("scap-push-up", ["chest", "shoulders"]),
      cooldown("wall-slide", ["shoulders"]),
    ],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  });

  const ids = cooldownItems(out).map((item) => item.exercise_id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(cooldownItems(out).map((item) => item.sets_prescribed), [1, 1]);
});

test("applyNarration caps folded same-day cool-down duplicate rounds at four", async () => {
  const out = await narrate({
    catalog: [{ id: "main-a", tr: ["chest", "shoulders", "upper_back", "triceps", "arms"] }],
    cooldownCatalog: [cooldown("single-multi-region", ["chest", "shoulders", "upper_back", "triceps", "arms"], [], 1)],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
  });

  const items = cooldownItems(out);
  assert.equal(items.length, 1);
  assert.equal(items[0].exercise_id, "single-multi-region");
  assert.equal(items[0].sets_prescribed, 4);
});

test("warm-up and cool-down selection histories remain independent", async () => {
  const sharedHistory = new Map([["glutes", new Set(["cool-a", "warm-a"])]]);
  const base = {
    catalog: [{ id: "main-a", tr: ["glutes"] }],
    weeks: [{ week_index: 1, days: [{ day_index: 1, program_day_key: "W1D1", segments: [segment("main", [ex("main-a")])] }] }],
    cooldownCatalog: [cooldown("cool-a", ["glutes"]), cooldown("cool-b", ["glutes"])],
    warmupCatalog: ["warm-a", "warm-b"].map((id) => ({ ...cooldown(id, ["glutes"]), warmup_exercise_id: id })),
  };
  const out = await narrate({ ...base, warmupHistory: sharedHistory });
  const coolOnly = await narrate({ ...base, warmupCatalog: [] });
  assert.deepEqual(cooldownItems(out), cooldownItems(coolOnly));
  const warmItems = (result) => result.program.weeks[0].days[0].segments.find((seg) => seg.segment_type === "warmup").items;
  const reverse = await narrate({ ...base, cooldownHistory: sharedHistory });
  const warmOnly = await narrate({ ...base, cooldownCatalog: [] });
  assert.deepEqual(warmItems(reverse), warmItems(warmOnly));
  const both = await narrate({ ...base, cooldownHistory: sharedHistory, warmupHistory: sharedHistory });
  assert.equal(cooldownItems(both)[0].exercise_id, "cool-b");
  assert.equal(warmItems(both)[0].exercise_id, "warm-b");
  assert.deepEqual([...sharedHistory.get("glutes")], ["cool-a", "warm-a"]);
  assert.equal(cooldownItems(both)[0].reps_prescribed, "30");
  assert.equal(cooldownItems(both)[0].reps_unit, "sec");
});
