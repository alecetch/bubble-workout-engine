import { formatGuidelineValue } from "../guidelineLoadFormat.js";
test("formats kg unit correctly", () => {
    expect(formatGuidelineValue({ value: 80, unit: "kg" })).toBe("80 kg");
});
test("formats kg_per_hand unit correctly", () => {
    expect(formatGuidelineValue({ value: 20, unit: "kg_per_hand" })).toBe("20 kg / hand");
});
test("formats bodyweight unit correctly", () => {
    expect(formatGuidelineValue({ value: 0, unit: "bodyweight" })).toBe("Bodyweight");
});
