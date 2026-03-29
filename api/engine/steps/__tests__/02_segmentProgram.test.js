import test from "node:test";
import assert from "node:assert/strict";
import { segmentProgram } from "../02_segmentProgram.js";

test("segmentProgram preserves exact block order for ordered simulation days", async () => {
  const result = await segmentProgram({
    compiledConfig: {
      programType: "hyrox",
      segmentation: {
        blockSemantics: {
          A: { preferred_segment_type: "single", purpose: "main", post_segment_rest_sec: 30 },
          B: { preferred_segment_type: "single", purpose: "main", post_segment_rest_sec: 30 },
        },
      },
    },
    program: {
      program_type: "hyrox",
      duration_mins: 50,
      days_per_week: 1,
      days: [
        {
          day_index: 1,
          day_type: "hyrox",
          is_ordered_simulation: true,
          blocks: [
            { block: "A", slot: "A:run_1", ex_id: "run1", ex_name: "Run", sets: 1, simulation_resolution: "exact" },
            { block: "B", slot: "B:ski_1", ex_id: "ski1", ex_name: "Ski", sets: 1, simulation_resolution: "exact" },
            { block: "A", slot: "A:row_1", ex_id: "row1", ex_name: "Row", sets: 1, simulation_resolution: "family" },
          ],
        },
      ],
    },
  });

  const items = result.program.days[0].segments.map((segment) => segment.items[0]);
  assert.deepEqual(
    items.map((item) => item.slot),
    ["A:run_1", "B:ski_1", "A:row_1"],
  );
  assert.deepEqual(
    items.map((item) => item.simulation_resolution),
    ["exact", "exact", "family"],
  );
  assert.equal(result.debug.ordered_simulation_days, 1);
});
