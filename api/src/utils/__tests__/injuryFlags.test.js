import test from "node:test";
import assert from "node:assert/strict";
import { INJURY_FLAG_OPTIONS, normalizeInjuryFlag, normalizeInjuryFlags, InvalidInjuryFlagError } from "../injuryFlags.js";
for (const { code, label } of INJURY_FLAG_OPTIONS) {
  for (const value of [code, label, label.toLowerCase(), code.replaceAll("_", "_/_"), `  ${label.toUpperCase()}  `]) {
    test(`normalises ${value}`, () => {
      assert.equal(normalizeInjuryFlag(value), code);
      assert.deepEqual(normalizeInjuryFlags([value, code]), [code]);
    });
  }
}
test("empty and null input", () => {
  for (const value of [null, undefined, [], "wrist_elbow"]) assert.deepEqual(normalizeInjuryFlags(value), []);
});
test("real flags take precedence over none", () => {
  assert.deepEqual(normalizeInjuryFlags(["No known issues", "Wrist / Elbow", "wrist_elbow"]), ["wrist_elbow"]);
});
test("unknown values fail closed without including health data in the error", () => {
  for (const value of ["unknown", "", null, 1, {}]) {
    assert.equal(normalizeInjuryFlag(value), null);
    assert.throws(() => normalizeInjuryFlags([value]), error => error instanceof InvalidInjuryFlagError && error.code === "invalid_injury_flag");
  }
});
