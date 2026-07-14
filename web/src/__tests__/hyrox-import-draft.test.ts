import { describe, expect, test } from "vitest";
import { AGE_GROUP_OPTIONS } from "../pages/RaceDetailsPage";
import { ageGroupFromAge, normalizeAgeGroup, normalizeName } from "../utils/hyroxImportDraft";

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

describe("ageGroupFromAge", () => {
  test("uses the server benchmark vocabulary at the lower and upper caps", () => {
    expect(ageGroupFromAge(20)).toBe("16-24");
    expect(ageGroupFromAge(72)).toBe("70+");
  });

  test("handles exact age-band boundaries", () => {
    expect(ageGroupFromAge(25)).toBe("25-29");
    expect(ageGroupFromAge(70)).toBe("70+");
  });
});

describe("normalizeAgeGroup", () => {
  test("normalizes legacy and current lower-cap bands to 16-24", () => {
    expect(normalizeAgeGroup("18-24")).toBe("16-24");
    expect(normalizeAgeGroup("16-24")).toBe("16-24");
  });

  test("normalizes HYROX age labels at the upper cap", () => {
    expect(normalizeAgeGroup("M70")).toBe("70+");
    expect(normalizeAgeGroup("F65")).toBe("65-69");
  });
});

describe("AGE_GROUP_OPTIONS", () => {
  test("matches server benchmark age vocabulary", () => {
    expect(AGE_GROUP_OPTIONS).toContain("16-24");
    expect(AGE_GROUP_OPTIONS).toContain("70+");
    expect(AGE_GROUP_OPTIONS).not.toContain("18-24");
  });
});
