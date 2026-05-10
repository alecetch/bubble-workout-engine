import { formatGuidelineValue } from "./guidelineLoadFormat";
test("formatGuidelineValue returns kg string for the default unit", () => {
    expect(formatGuidelineValue({ value: 100, unit: "kg" })).toBe("100 kg");
});
test("formatGuidelineValue returns 'Bodyweight' for bodyweight unit (value ignored)", () => {
    expect(formatGuidelineValue({ value: 0, unit: "bodyweight" })).toBe("Bodyweight");
});
test("formatGuidelineValue returns per-hand string for kg_per_hand", () => {
    expect(formatGuidelineValue({ value: 20, unit: "kg_per_hand" })).toBe("20 kg / hand");
});
test("formatGuidelineValue returns per-side string for kg_per_side", () => {
    expect(formatGuidelineValue({ value: 15, unit: "kg_per_side" })).toBe("15 kg / side");
});
