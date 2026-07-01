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

test("submissionInput maps calibration athlete context into pipeline fields", () => {
  const input = submissionInput({
    athlete: { email: "athlete@example.com", sex: "male", ageOnRaceDay: 34 },
    race: { division: "open", finishTimeSeconds: 4800 },
    athleteContext: {
      targetFinishTimeSeconds: 4500,
      run5kPbSeconds: 1320,
      run10kPbSeconds: 2820,
      backSquat3RMKg: 100,
      deadlift3RMKg: 145,
      targetRaceDate: "2026-11-15",
    },
  });

  assert.equal(input.athleteContext.fiveKmPbSeconds, 1320);
  assert.equal(input.athleteContext.tenKmPbSeconds, 2820);
  assert.equal(input.athleteContext.backSquatKg, 100);
  assert.equal(input.athleteContext.deadliftKg, 145);
  assert.equal(input.athleteContext.targetRaceDate, "2026-11-15");
});
