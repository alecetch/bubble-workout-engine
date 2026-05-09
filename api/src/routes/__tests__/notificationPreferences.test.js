import test from "node:test";
import assert from "node:assert/strict";
import { PUSH_TOKEN_RE, isValidHhmm, isValidTimezone } from "../notificationPreferences.js";

test("PUSH_TOKEN_RE accepts valid Expo token", () => {
  assert.equal(PUSH_TOKEN_RE.test("ExponentPushToken[abc123]"), true);
});

test("PUSH_TOKEN_RE rejects arbitrary strings", () => {
  assert.equal(PUSH_TOKEN_RE.test("fcm:token"), false);
  assert.equal(PUSH_TOKEN_RE.test(""), false);
});

test("isValidHhmm accepts 08:00 and 23:59", () => {
  assert.equal(isValidHhmm("08:00"), true);
  assert.equal(isValidHhmm("23:59"), true);
  assert.equal(isValidHhmm("00:00"), true);
});

test("isValidHhmm rejects invalid times and formats", () => {
  assert.equal(isValidHhmm("24:00"), false);
  assert.equal(isValidHhmm("8:00"), false);
  assert.equal(isValidHhmm("08:60"), false);
});

test("isValidTimezone accepts canonical IANA zone and rejects garbage", () => {
  assert.equal(isValidTimezone("Europe/London"), true);
  assert.equal(isValidTimezone("Nope/Nowhere"), false);
});
