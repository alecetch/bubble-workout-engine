import assert from "node:assert/strict";
import test from "node:test";
import { submissionInput } from "../../src/hyrox/hyroxController.js";

test("submissionInput preserves race replay rows for analysis", () => {
  const raceReplay = [
    { station: "ski_erg", entrySeconds: 8, exitSeconds: 29 },
    { station: "sled_push", entrySeconds: 4, exitSeconds: 36 },
  ];

  const input = submissionInput({
    athlete: { email: "athlete@example.com", sex: "male", ageOnRaceDay: 34 },
    race: { division: "open", finishTimeSeconds: 4800 },
    splits: [],
    penalties: [],
    raceReplay,
  });

  assert.deepEqual(input.raceReplay, raceReplay);
});
