import test from "node:test";
import assert from "node:assert/strict";
import { PATTERN_FALLBACK_REGIONS, fallbackRegionsForEx, requiredBookendRegionsForDay } from "../05_applyNarration.js";

const expected = {
  anti_extension: ["core"], calf: ["calves"], carry: ["grip", "core"],
  cyclical_engine: ["cardio"], locomotion: ["cardio"], push_ballistic: ["cardio"],
  sled_pull: ["cardio"], sled_push: ["cardio"], hinge: ["hamstrings", "glutes"],
  lunge: ["quads", "glutes"], squat: ["quads", "glutes"],
  pull_horizontal: ["upper_back", "biceps"], pull_vertical: ["lats", "biceps"],
  push_horizontal: ["chest", "triceps", "shoulders"], push_vertical: ["shoulders", "triceps"],
};

test("pattern fallback table is frozen and covers all active patterns", () => {
  assert.deepEqual(PATTERN_FALLBACK_REGIONS, expected);
  assert.ok(Object.isFrozen(PATTERN_FALLBACK_REGIONS));
  for (const [pattern, regions] of Object.entries(expected)) {
    assert.deepEqual(fallbackRegionsForEx({ x: { mp: pattern } }, "x"), regions);
    assert.ok(Object.isFrozen(PATTERN_FALLBACK_REGIONS[pattern]));
  }
});

test("fallback returns a copy and handles alternate, unknown, empty and missing patterns", () => {
  const first = fallbackRegionsForEx({ x: { movement_pattern_primary: "hinge" } }, "x");
  first.push("core");
  assert.deepEqual(fallbackRegionsForEx({ x: { movement_pattern_primary: "hinge" } }, "x"), ["hamstrings", "glutes"]);
  assert.deepEqual(fallbackRegionsForEx({ x: { mp: "unknown" } }, "x"), []);
  assert.deepEqual(fallbackRegionsForEx({ x: { mp: "" } }, "x"), []);
  assert.deepEqual(fallbackRegionsForEx({}, "missing"), []);
});

const day = ids => ({ segments: [{ purpose: "main", segment_type: "straight_sets", items: ids.map(ex_id => ({ ex_id })) }] });

test("required regions prefer explicit data and report fallback usage", () => {
  assert.deepEqual(requiredBookendRegionsForDay(day(["x"]), { x: { tr: ["chest"], mp: "hinge" } }), { regions: ["chest"], fallbacks: 0 });
  assert.deepEqual(requiredBookendRegionsForDay(day(["x"]), { x: { tr: [], mp: "hinge" } }), { regions: ["hamstrings", "glutes"], fallbacks: 1 });
});

test("priority order and five-region cap remain when fallbacks are mixed", () => {
  const mixed = { segments: [
    { purpose: "accessory", items: [{ ex_id: "accessory" }] },
    { purpose: "main", items: [{ ex_id: "main" }] },
    { purpose: "secondary", items: [{ ex_id: "secondary" }] },
  ] };
  const result = requiredBookendRegionsForDay(mixed, {
    main: { tr: [], mp: "push_horizontal" }, secondary: { tr: ["quads", "glutes"] }, accessory: { tr: ["core"] },
  });
  assert.deepEqual(result, { regions: ["chest", "triceps", "shoulders", "quads", "glutes"], fallbacks: 1 });
});
