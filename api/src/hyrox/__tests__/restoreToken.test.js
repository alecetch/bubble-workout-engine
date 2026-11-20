import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mintRestoreToken, verifyRestoreToken, _resetForTest } from "../restoreToken.js";
const original = process.env.JWT_SECRET;
const id = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
const now = 1800000000000;
beforeEach(() => { process.env.JWT_SECRET = "restore-unit-test-secret"; _resetForTest(); });
after(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; _resetForTest(); });
test("restore tokens match the purpose-derived HMAC and normalize submission IDs", () => {
  const token = mintRestoreToken(id.toUpperCase(), { now });
  const exp = Math.floor(now / 1000) + 30 * 86400;
  const key = createHmac("sha256", process.env.JWT_SECRET).update("hyrox-restore-v1").digest();
  assert.equal(token, `v1.${exp}.${createHmac("sha256", key).update(`${id}.${exp}`).digest("base64url")}`);
  assert.equal(verifyRestoreToken(token, id, { now }), true);
});
for (const [label, mutate, otherId, checkNow] of [
  ["other submission", x => x, "22222222-2222-4222-8222-222222222222"],
  ["expired", x => x, id, now + 31 * 86400000],
  ["at expiry", x => x, id, now + 30 * 86400000],
  ["tampered", x => x.slice(0,-2) + (x.at(-2) === "a" ? "b" : "a") + x.at(-1)],
  ["wrong version", x => x.replace("v1.", "v2.")],
  ["length mismatch", x => x.slice(0,-4)],
  ["bad format", () => "v1.bad.signature"],
  ["non-string", () => ({ token: "bad" })],
  ["missing", () => undefined],
  ["empty", () => ""],
]) test(`rejects ${label}`, () => {
  assert.equal(verifyRestoreToken(mutate(mintRestoreToken(id, { now })), otherId ?? id, { now: checkNow ?? now }), false);
});
test("missing signing secret fails closed", () => {
  const token = mintRestoreToken(id, { now }); delete process.env.JWT_SECRET; _resetForTest();
  assert.equal(mintRestoreToken(id), null); assert.equal(verifyRestoreToken(token, id, { now }), false);
});
