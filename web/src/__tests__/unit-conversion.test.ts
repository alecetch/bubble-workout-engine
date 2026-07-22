import { describe, expect, test } from "vitest";
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from "../utils/unitConversion";

describe("unit conversion utilities", () => {
  test("kg and lb round-trip within tolerance", () => {
    const kg = 82.5;
    expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 1);
  });

  test("cm and feet-inches round-trip within tolerance", () => {
    const cm = 180;
    const { feet, inches } = cmToFeetInches(cm);
    expect(feetInchesToCm(feet, inches)).toBeCloseTo(cm, 0);
  });

  test("cm to feet-inches carries 12 inches into the next foot", () => {
    expect(cmToFeetInches(182)).toEqual({ feet: 6, inches: 0 });
  });
});
