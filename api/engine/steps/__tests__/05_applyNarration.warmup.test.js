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

function warmup(id, regions, equipment = [], rounds = 1, videoStatus) {
  return {
    warmup_exercise_id: id,
    name: id,
    target_regions_json: regions,
    equipment_items_slugs: equipment,
    cue_text: `${id} cue`,
    duration_or_reps_label: "10 reps",
    rounds,
    ...(videoStatus === undefined ? {} : { video_status: videoStatus }),
  };
}

async function narrate({ weeks, catalog, warmupCatalog, warmupHistory = {}, effectiveEquipment = [], injuryFlags = [] }) {
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
    injuryFlags,
  });
}

function warmupItems(out, weekIndex = 0, dayIndex = 0) {
  return out.program.weeks[weekIndex].days[dayIndex].segments.find((seg) => seg.segment_type === "warmup").items;
}

function videoPreferenceFixture(warmupCatalog, overrides = {}) {
  return {
    catalog: [{ id: 'main', tr: ['glutes'] }],
    warmupCatalog,
    weeks: [{ week_index: 1, days: Array.from({ length: 8 }, (_, i) => ({
      week_index: 1, day_index: i + 1, program_day_key: `W1D${i + 1}`,
      segments: [segment('main', [ex('main')])],
    })) }],
    ...overrides,
  };
}

test('warm-ups prefer a ready video across different day hashes', async () => {
  const out = await narrate(videoPreferenceFixture([
    warmup('a', ['glutes'], [], 1, 'ready'), warmup('b', ['glutes']), warmup('c', ['glutes']),
  ]));
  for (let i = 0; i < 8; i++) assert.equal(warmupItems(out, 0, i)[0].exercise_id, 'a');
  assert.equal(out.debug.adoption.total.warmup_video_preferred_regions, 8);
});

test('warm-ups fall back to unfilmed rows when no eligible video is ready', async () => {
  const out = await narrate(videoPreferenceFixture([warmup('a', ['glutes']), warmup('b', ['glutes'])]));
  for (let i = 0; i < 8; i++) assert.equal(warmupItems(out, 0, i).length, 1);
  assert.equal(out.debug.adoption.total.warmup_video_preferred_regions, 0);
});

test('all-ready warm-up selection matches selection without video statuses', async () => {
  const rows = ['a', 'b', 'c'].map(id => warmup(id, ['glutes']));
  const unfilmed = await narrate(videoPreferenceFixture(rows));
  const ready = await narrate(videoPreferenceFixture(rows.map(row => ({ ...row, video_status: 'ready' }))));
  for (let i = 0; i < 8; i++) assert.deepEqual(warmupItems(ready, 0, i), warmupItems(unfilmed, 0, i));
  assert.equal(ready.debug.adoption.total.warmup_video_preferred_regions, 0);
});

test('warm-up history repeats the ready row instead of selecting an unfilmed row', async () => {
  const out = await narrate(videoPreferenceFixture([
    warmup('a', ['glutes'], [], 1, 'ready'), warmup('b', ['glutes']),
  ], { warmupHistory: { glutes: ['a'] } }));
  assert.equal(warmupItems(out)[0].exercise_id, 'a');
  assert.ok(out.debug.adoption.total.warmup_video_preferred_regions > 0);
});

test('warm-up equipment eligibility is applied before video preference', async () => {
  const out = await narrate(videoPreferenceFixture([
    warmup('a', ['glutes'], ['band'], 1, 'ready'), warmup('b', ['glutes']),
  ]));
  assert.equal(warmupItems(out)[0].exercise_id, 'b');
  assert.equal(out.debug.adoption.total.warmup_video_preferred_regions, 0);
});

test('same-day warm-up reuse stays within the ready-video pool', async () => {
  const out = await narrate(videoPreferenceFixture([
    warmup('a', ['glutes', 'hamstrings'], [], 1, 'ready'), warmup('b', ['glutes']), warmup('c', ['hamstrings']),
  ], { catalog: [{ id: 'main', tr: ['glutes', 'hamstrings'] }] }));
  assert.deepEqual(warmupItems(out).map(item => [item.exercise_id, item.sets_prescribed]), [['a', 2]]);
  assert.equal(out.debug.adoption.total.warmup_video_preferred_regions, 16);
});

test("movement patterns supply warm-ups when target regions are empty", async () => {
  const out = await narrate({
    catalog: [{ id: "bench", tr: [], mp: "push_horizontal" }, { id: "squat", tr: [], mp: "squat" }],
    warmupCatalog: [warmup("chest-warmup", ["chest"]), warmup("quad-warmup", ["quads"])],
    weeks: [{ week_index: 1, days: [{ week_index: 1, day_index: 1, segments: [segment("main", [ex("bench"), ex("squat")])] }] }],
  });
  assert.ok(warmupItems(out).length >= 1);
  assert.ok(out.debug.adoption.total.bookend_region_fallbacks > 0);
});

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


test('warmup injury filtering precedes video preference and preserves region coverage', async () => {
  const rows = [
    { ...warmup('unsafe-ready', ['glutes', 'hamstrings'], [], 1, 'ready'), contraindications_slugs: ['wrist_elbow'] },
    warmup('safe-glutes', ['glutes']),
    { ...warmup('safe-hamstrings', ['hamstrings']), contraindications_slugs: '["knee_issues"]' },
  ];
  const fixture = videoPreferenceFixture(rows, {
    catalog: [{ id: 'main', tr: ['glutes', 'hamstrings'] }],
    injuryFlags: ['wrist_elbow'],
    warmupHistory: { glutes: ['safe-glutes'], hamstrings: ['safe-hamstrings'] },
  });
  const before = await narrate({ ...fixture, injuryFlags: [] });
  const out = await narrate(fixture);
  assert.ok(warmupItems(before).some(item => item.exercise_id === 'unsafe-ready'));
  for (let i = 0; i < 8; i++) {
    assert.deepEqual(new Set(warmupItems(out, 0, i).map(item => item.exercise_id)), new Set(['safe-glutes', 'safe-hamstrings']));
  }
});

test('warmup never reintroduces contraindicated rows when no eligible alternative exists', async () => {
  const out = await narrate(videoPreferenceFixture([
    { ...warmup('unsafe', ['glutes'], [], 1, 'ready'), contraindications_slugs: '["wrist_elbow"]' },
  ], { injuryFlags: ['knee_issues', 'wrist_elbow'] }));
  for (const day of out.program.weeks[0].days) {
    assert.ok(!day.segments.some(segment => segment.segment_type === 'warmup' && segment.items.length));
  }
});

test('warmup injury flag no_known_issues behaves exactly like no flags', async () => {
  // A row tagged no_known_issues would be dropped if the flag were not ignored.
  const fixture = videoPreferenceFixture([
    { ...warmup('tagged-odd', ['glutes'], [], 1, 'ready'), contraindications_slugs: ['no_known_issues'] },
    warmup('plain', ['glutes']),
    { ...warmup('wrist', ['hamstrings']), contraindications_slugs: ['wrist_elbow'] },
  ], { catalog: [{ id: 'main', tr: ['glutes', 'hamstrings'] }] });
  const none = await narrate({ ...fixture, injuryFlags: [] });
  const noKnown = await narrate({ ...fixture, injuryFlags: ['no_known_issues', ''] });
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(warmupItems(noKnown, 0, i), warmupItems(none, 0, i));
  }
  assert.ok(warmupItems(noKnown).some(item => item.exercise_id === 'tagged-odd'));
});


test('warmup selects flagged still-only exercises alongside ready videos, excluding unfinished rows', async () => {
  const out = await narrate(videoPreferenceFixture([
    warmup('ready', ['glutes'], [], 1, 'ready'),
    { ...warmup('still-only', ['glutes']), video_not_needed: true },
    warmup('unfinished', ['glutes']),
  ]));
  const selected = out.program.weeks[0].days.flatMap((_, i) => warmupItems(out, 0, i).map(item => item.exercise_id));
  assert.ok(selected.includes('still-only'));
  assert.ok(selected.includes('ready'));
  assert.ok(!selected.includes('unfinished'));
});
