import { describe, expect, test } from "vitest";
import { normalizeName } from "../utils/hyroxImportDraft";

describe("normalizeName", () => {
  test("converts comma-separated HYROX names to first-name first", () => {
    expect(normalizeName("vanadia, gaston")).toBe("Gaston Vanadia");
  });

  test("converts all-caps surname-first HYROX names to first-name first", () => {
    expect(normalizeName("VANADIA Gaston")).toBe("Gaston Vanadia");
  });

  test("converts doubles names independently", () => {
    expect(normalizeName("SMITH Alice & JONES Bob")).toBe("Alice Smith & Bob Jones");
  });
});
