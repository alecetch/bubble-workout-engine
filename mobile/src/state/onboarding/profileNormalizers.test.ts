import { describe, expect, it } from "vitest";
import { normalizeAgeRange, normalizeDays, normalizeFitnessLevel, normalizeGoals, normalizeSex } from "./profileNormalizers";

describe("profile normalizers", () => {
  it("maps goal slugs, display values and mixed case", () => {
    expect(normalizeGoals(["conditioning", "hyrox_competition", "HYROX Workout", "StReNgTh", "HYPERTROPHY", "hyrox"]))
      .toEqual(["Conditioning", "HYROX Workout", "Strength", "Hypertrophy"]);
  });

  it("maps abbreviated day aliases", () => {
    expect(normalizeDays(["mon", "tue", "thur", "sat"])).toEqual(["Mon", "Tues", "Thurs", "Sat"]);
    expect(normalizeDays(["Tues", "THU", "Thurs"])).toEqual(["Tues", "Thurs"]);
  });

  it("maps full day names in order", () => {
    expect(normalizeDays(["Monday", "tuesday", "WEDNESDAY", "Thursday", "Friday", "Saturday", "Sunday"]))
      .toEqual(["Mon", "Tues", "Wed", "Thurs", "Fri", "Sat", "Sun"]);
  });

  it("collapses duplicates and drops unknown goals and days", () => {
    expect(normalizeGoals(["Strength", "strength", "unknown", null])).toEqual(["Strength"]);
    expect(normalizeDays(["Mon", "monday", "funday", null])).toEqual(["Mon"]);
  });

  it("accepts missing and non-array lists without inventing selections", () => {
    expect(normalizeGoals(undefined)).toEqual([]);
    expect(normalizeDays("mon")).toEqual([]);
  });

  it("normalizes fitness, sex and age text returned unchanged by the API", () => {
    expect(normalizeFitnessLevel(" intermediate ")).toBe("Intermediate");
    expect(normalizeSex("prefer_not_to_say")).toBe("Prefer not to say");
    expect(normalizeSex("FEMALE")).toBe("Female");
    expect(normalizeAgeRange("under_18")).toBe("Under 18");
    expect(normalizeAgeRange("25-34")).toBe("25-34");
    expect(normalizeAgeRange("65+")).toBe("65+");
    expect(normalizeFitnessLevel("unknown")).toBeNull();
    expect(normalizeSex(null)).toBeNull();
    expect(normalizeAgeRange("unknown")).toBeNull();
  });
});
