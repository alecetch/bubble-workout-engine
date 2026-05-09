import test from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "./normalizeText.js";

test("normalizeText trims leading and trailing whitespace", () => {
  assert.equal(normalizeText("  hello world  "), "hello world");
});

test("normalizeText normalizes CRLF and CR to LF", () => {
  assert.equal(normalizeText("line1\r\nline2\rline3"), "line1\nline2\nline3");
});

test("normalizeText collapses three or more newlines to two", () => {
  assert.equal(normalizeText("a\n\n\n\nb"), "a\n\nb");
});

test("normalizeText preserves two newlines", () => {
  assert.equal(normalizeText("a\n\nb"), "a\n\nb");
});

test("normalizeText returns empty string for empty input", () => {
  assert.equal(normalizeText(""), "");
});

test("normalizeText leaves already-normalized text unchanged", () => {
  assert.equal(normalizeText("Alpha\n\nBeta"), "Alpha\n\nBeta");
});
