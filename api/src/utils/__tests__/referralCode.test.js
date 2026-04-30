import test from "node:test";
import assert from "node:assert/strict";
import { generateReferralCode } from "../referralCode.js";

const VALID_CHARS = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");

test("generateReferralCode returns 8-character string", () => {
  const code = generateReferralCode();
  assert.equal(typeof code, "string");
  assert.equal(code.length, 8);
});

test("generateReferralCode uses only allowed characters", () => {
  for (let i = 0; i < 100; i++) {
    const code = generateReferralCode();
    for (const char of code) {
      assert.ok(VALID_CHARS.has(char), `Unexpected char: ${char}`);
    }
  }
});

test("generateReferralCode produces diverse codes", () => {
  const codes = new Set(Array.from({ length: 100 }, generateReferralCode));
  assert.ok(codes.size >= 95, "Expected near-unique codes across 100 calls");
});
