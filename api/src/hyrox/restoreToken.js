import { createHmac, timingSafeEqual } from "node:crypto";

let cachedKey;
function key() {
  if (cachedKey === undefined) cachedKey = process.env.JWT_SECRET
    ? createHmac("sha256", process.env.JWT_SECRET).update("hyrox-restore-v1").digest()
    : null;
  return cachedKey;
}
function signature(submissionId, exp) {
  return createHmac("sha256", key()).update(`${submissionId.toLowerCase()}.${exp}`).digest();
}
export function mintRestoreToken(submissionId, { now = Date.now(), ttlDays = 30 } = {}) {
  if (!key() || typeof submissionId !== "string") return null;
  const exp = Math.floor((now + ttlDays * 86400000) / 1000);
  if (!Number.isSafeInteger(exp) || exp < 0) return null;
  return `v1.${exp}.${signature(submissionId, exp).toString("base64url")}`;
}
export function verifyRestoreToken(token, submissionId, { now = Date.now() } = {}) {
  if (!key() || typeof token !== "string" || typeof submissionId !== "string") return false;
  const match = /^v1\.(0|[1-9]\d{0,15})\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!match) return false;
  const exp = Number(match[1]);
  if (!Number.isSafeInteger(exp) || exp * 1000 <= now) return false;
  const supplied = Buffer.from(match[2], "base64url");
  const expected = signature(submissionId, exp);
  return supplied.length === expected.length && supplied.toString("base64url") === match[2]
    && timingSafeEqual(supplied, expected);
}
export function _resetForTest() { cachedKey = undefined; }
