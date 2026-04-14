import test from "node:test";
import assert from "node:assert/strict";
import { clamp, parseNumberOrNull } from "./numbers.js";

test("parseNumberOrNull parses whole numbers", () => {
  assert.equal(parseNumberOrNull("42"), 42);
});

test("parseNumberOrNull parses decimals", () => {
  assert.equal(parseNumberOrNull("3.14"), 3.14);
});

test("parseNumberOrNull returns null for empty string", () => {
  assert.equal(parseNumberOrNull(""), null);
});

test("parseNumberOrNull returns null for whitespace", () => {
  assert.equal(parseNumberOrNull("  "), null);
});

test("parseNumberOrNull returns null for non-numeric input", () => {
  assert.equal(parseNumberOrNull("abc"), null);
});

test("parseNumberOrNull preserves zero", () => {
  assert.equal(parseNumberOrNull("0"), 0);
});

test("parseNumberOrNull parses negative values", () => {
  assert.equal(parseNumberOrNull("-5"), -5);
});

test("parseNumberOrNull returns null for null-like input", () => {
  assert.equal(parseNumberOrNull(null as unknown as string), null);
});

test("clamp returns value when already within range", () => {
  assert.equal(clamp(5, 1, 10), 5);
});

test("clamp returns min when value is below range", () => {
  assert.equal(clamp(-1, 1, 10), 1);
});

test("clamp returns max when value is above range", () => {
  assert.equal(clamp(11, 1, 10), 10);
});

test("clamp preserves exact min boundary", () => {
  assert.equal(clamp(1, 1, 10), 1);
});

test("clamp preserves exact max boundary", () => {
  assert.equal(clamp(10, 1, 10), 10);
});
