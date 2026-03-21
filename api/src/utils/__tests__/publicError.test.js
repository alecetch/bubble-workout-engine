import test from "node:test";
import assert from "node:assert/strict";
import { publicInternalError } from "../publicError.js";

test("dev mode - returns err.message", () => {
  assert.equal(publicInternalError(new Error("something broke"), false), "something broke");
});

test("dev mode - returns fallback when err has no message", () => {
  assert.equal(publicInternalError({}, false), "Internal server error");
});

test("dev mode - returns fallback for null err", () => {
  assert.equal(publicInternalError(null, false), "Internal server error");
});

test("production mode - always returns generic string", () => {
  assert.equal(publicInternalError(new Error("detailed db error"), true), "Internal server error");
});

test("production mode - same generic string for null err", () => {
  assert.equal(publicInternalError(null, true), "Internal server error");
});
