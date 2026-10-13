import { describe, expect, it } from "vitest";
import { displayLabel, displayLabelMaps } from "./displayLabel";

for (const kind of Object.keys(displayLabelMaps) as Array<keyof typeof displayLabelMaps>) {
  describe(kind, () => {
    for (const [slug, label] of Object.entries(displayLabelMaps[kind])) {
      it(`${slug} displays as ${label}`, () => {
        expect(displayLabel(kind, slug)).toBe(label);
        expect(displayLabel(kind, slug.toUpperCase().replaceAll("_", " "))).toBe(label);
      });
    }
  });
}

it("uses semantic focus aliases and preserves HYROX", () => {
  expect(displayLabel("dayFocus", "full")).toBe("Full Body");
  expect(displayLabel("dayFocus", "full_body")).toBe("Full Body");
  expect(displayLabel("programType", "hyrox")).toBe("HYROX");
});

it("capitalises unknown words without changing existing capitals", () => {
  expect(displayLabel("dayFocus", "posterior_chain")).toBe("Posterior Chain");
  expect(displayLabel("dayFocus", "Upper (Push)")).toBe("Upper (Push)");
  expect(displayLabel("dayFocus", "HYROX")).toBe("HYROX");
  expect(displayLabel("dayFocus", "custom_HIIT")).toBe("Custom HIIT");
  expect(displayLabel("dayFocus", "constructor")).toBe("Constructor");
});

it("returns empty strings for empty or absent labels", () => {
  for (const slug of ["", "  ", null, undefined]) expect(displayLabel("programType", slug)).toBe("");
});
