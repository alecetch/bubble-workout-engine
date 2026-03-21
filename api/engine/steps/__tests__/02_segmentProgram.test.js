import test from "node:test";
import assert from "node:assert/strict";
import { segmentProgram } from "../02_segmentProgram.js";

function makeMinimalCompiledConfig(overrides = {}) {
  return {
    programType: "strength",
    schemaVersion: 1,
    configKey: "strength_test_v1",
    source: "test",
    builder: {
      dayTemplates: [["A:squat", "B:pull_horizontal"]],
      setsByDuration: { "50": { A: 5, B: 4, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      slotDefaults: {},
    },
    segmentation: {
      blockSemantics: {
        A: { preferred_segment_type: "single", purpose: "main", post_segment_rest_sec: 90 },
        B: { preferred_segment_type: "single", purpose: "secondary", post_segment_rest_sec: 60 },
        C: { preferred_segment_type: "superset", purpose: "accessory", post_segment_rest_sec: 45 },
        D: { preferred_segment_type: "giant_set", purpose: "accessory", post_segment_rest_sec: 30 },
      },
      blockSemanticsByFocus: {},
    },
    ...overrides,
  };
}

function makeProgram(days = []) {
  return {
    program_type: "strength",
    duration_mins: 50,
    days_per_week: days.length,
    days,
  };
}

function makeDay(blocks = [], overrides = {}) {
  return {
    day_index: 1,
    day_type: "strength",
    day_focus: null,
    duration_mins: 50,
    blocks,
    ...overrides,
  };
}

function makeBlock(overrides = {}) {
  return {
    block: "A",
    slot: "A:squat",
    ex_id: "ex1",
    ex_name: "Squat",
    sets: 5,
    ...overrides,
  };
}

test("throws when program.days is missing", async () => {
  await assert.rejects(
    () => segmentProgram({ program: {}, compiledConfig: makeMinimalCompiledConfig() }),
    /missing days/i,
  );
});

test("throws when blockSemantics is missing from compiledConfig", async () => {
  const program = makeProgram([makeDay([makeBlock()])]);
  await assert.rejects(
    () => segmentProgram({ program, compiledConfig: { segmentation: {} } }),
    /blockSemantics/i,
  );
});

test("single block letter with preferred_segment_type=single produces single segment", async () => {
  const day = makeDay([makeBlock({ block: "A", slot: "A:squat", ex_id: "ex1", ex_name: "Squat", sets: 5 })]);
  const compiledConfig = makeMinimalCompiledConfig();

  const result = await segmentProgram({ program: makeProgram([day]), compiledConfig });
  const seg = result.program.days[0].segments[0];

  assert.equal(seg.segment_type, "single");
  assert.equal(seg.purpose, "main");
  assert.equal(seg.items[0].ex_id, "ex1");
});

test("two C-block exercises with preferred_segment_type=superset produce one superset segment", async () => {
  const blocks = [
    makeBlock({ block: "C", slot: "C:arms", ex_id: "ex2", ex_name: "Curl", sets: 3 }),
    makeBlock({ block: "C", slot: "C:tricep", ex_id: "ex3", ex_name: "Pushdown", sets: 3 }),
  ];
  const day = makeDay(blocks);
  const compiledConfig = makeMinimalCompiledConfig();

  const result = await segmentProgram({ program: makeProgram([day]), compiledConfig });

  assert.equal(result.program.days[0].segments[0].segment_type, "superset");
  assert.equal(result.program.days[0].segments[0].items.length, 2);
});

test("single C-block exercise with preferred_segment_type=superset falls back to single", async () => {
  const blocks = [makeBlock({ block: "C", slot: "C:arms", ex_id: "ex2", ex_name: "Curl", sets: 3 })];
  const day = makeDay(blocks);
  const compiledConfig = makeMinimalCompiledConfig();

  const result = await segmentProgram({ program: makeProgram([day]), compiledConfig });

  assert.equal(result.program.days[0].segments[0].segment_type, "single");
});

test("three D-block exercises with preferred_segment_type=giant_set produce one giant_set", async () => {
  const blocks = [
    makeBlock({ block: "D", slot: "D:one", ex_id: "ex2", ex_name: "Curl", sets: 3 }),
    makeBlock({ block: "D", slot: "D:two", ex_id: "ex3", ex_name: "Pushdown", sets: 3 }),
    makeBlock({ block: "D", slot: "D:three", ex_id: "ex4", ex_name: "Raise", sets: 3 }),
  ];
  const day = makeDay(blocks);
  const compiledConfig = makeMinimalCompiledConfig();

  const result = await segmentProgram({ program: makeProgram([day]), compiledConfig });

  assert.equal(result.program.days[0].segments[0].segment_type, "giant_set");
  assert.equal(result.program.days[0].segments[0].items.length, 3);
});

test("fill:add_sets blocks are resolved before segmentation (target block gains sets)", async () => {
  const realBlock = makeBlock({ block: "A", slot: "A:squat", ex_id: "ex1", ex_name: "Squat", sets: 5 });
  const fillBlock = { block: "C", slot: "C:filler", fill: "add_sets", target_slot: "A:squat", add_sets: 1 };
  const day = makeDay([realBlock, fillBlock]);
  const compiledConfig = makeMinimalCompiledConfig();

  const result = await segmentProgram({ program: makeProgram([day]), compiledConfig });
  const mainSeg = result.program.days[0].segments.find((s) => s.items[0].ex_id === "ex1");

  assert.equal(mainSeg.rounds, 1);
  assert.equal(mainSeg.items[0].sets, 6);
});

test("day_focus triggers blockSemanticsByFocus override", async () => {
  const compiledConfig = makeMinimalCompiledConfig({
    segmentation: {
      blockSemantics: {
        A: { preferred_segment_type: "single", purpose: "main" },
      },
      blockSemanticsByFocus: {
        upper: { A: { preferred_segment_type: "superset", purpose: "main" } },
      },
    },
  });
  const day = makeDay(
    [
      makeBlock({ block: "A", slot: "A:squat", ex_id: "ex1", ex_name: "Squat" }),
      makeBlock({ block: "A", slot: "A:push", ex_id: "ex2", ex_name: "Press" }),
    ],
    { day_focus: "upper" },
  );

  const result = await segmentProgram({ program: makeProgram([day]), compiledConfig });

  assert.equal(result.program.days[0].segments[0].segment_type, "superset");
});

test("output preserves day_index, day_type, duration_mins", async () => {
  const day = makeDay([makeBlock()], { day_index: 3, day_type: "strength", duration_mins: 60 });
  const compiledConfig = makeMinimalCompiledConfig();

  const result = await segmentProgram({ program: makeProgram([day]), compiledConfig });

  assert.equal(result.program.days[0].day_index, 3);
  assert.equal(result.program.days[0].day_type, "strength");
  assert.equal(result.program.days[0].duration_mins, 60);
});
