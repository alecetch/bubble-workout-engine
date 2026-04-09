import test from "node:test";
import assert from "node:assert/strict";
import { toTitleCase } from "./text.js";

test("toTitleCase converts space-separated words", () => {
  assert.equal(toTitleCase("hello world"), "Hello World");
});

test("toTitleCase converts underscore-separated words", () => {
  assert.equal(toTitleCase("hello_world"), "Hello World");
});

test("toTitleCase converts hyphen-separated words", () => {
  assert.equal(toTitleCase("hello-world"), "Hello World");
});

test("toTitleCase normalizes uppercase text", () => {
  assert.equal(toTitleCase("UPPER CASE"), "Upper Case");
});

test("toTitleCase returns empty string for empty input", () => {
  assert.equal(toTitleCase(""), "");
});

test("toTitleCase capitalizes a single word", () => {
  assert.equal(toTitleCase("single"), "Single");
});

test("toTitleCase preserves already-title-cased text", () => {
  assert.equal(toTitleCase("Hello World"), "Hello World");
});
