import test from "node:test";
import assert from "node:assert/strict";
import { displayLabel, displayLabelMaps } from "../displayLabels.js";

for (const [kind, labels] of Object.entries(displayLabelMaps)) {
  for (const [slug, label] of Object.entries(labels)) {
    test(`${kind}: ${slug} displays as ${label}`, () => {
      assert.equal(displayLabel(kind, slug), label);
      assert.equal(displayLabel(kind, slug.toUpperCase().replaceAll("_", " ")), label);
    });
  }
}

test("known aliases and acronyms have semantic display labels", () => {
  assert.equal(displayLabel("dayFocus", "full"), "Full Body");
  assert.equal(displayLabel("dayFocus", "full_body"), "Full Body");
  assert.equal(displayLabel("programType", "hyrox"), "HYROX");
});

test("unknown labels capitalise words while preserving existing capitals", () => {
  assert.equal(displayLabel("dayFocus", "posterior_chain"), "Posterior Chain");
  assert.equal(displayLabel("dayFocus", "Upper (Push)"), "Upper (Push)");
  assert.equal(displayLabel("dayFocus", "HYROX"), "HYROX");
  assert.equal(displayLabel("dayFocus", "custom_HIIT"), "Custom HIIT");
  assert.equal(displayLabel("dayFocus", "constructor"), "Constructor");
});

test("empty and null labels return empty strings", () => {
  for (const kind of Object.keys(displayLabelMaps)) {
    for (const slug of ["", "  ", null, undefined]) assert.equal(displayLabel(kind, slug), "");
  }
});
