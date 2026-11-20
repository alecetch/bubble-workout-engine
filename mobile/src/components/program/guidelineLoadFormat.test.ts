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

for(const [kind,kg,lb] of [["kg","22.5 kg","50 lb"],["kg_per_hand","22.5 kg / hand","50 lb / hand"],["kg_per_side","22.5 kg / side","50 lb / side"],["bodyweight","Bodyweight","Bodyweight"]])
 test(`guideline ${kind} respects both units`,()=>{expect(formatGuidelineValue({value:22.5,unit:kind},"kg")).toBe(kg);expect(formatGuidelineValue({value:22.5,unit:kind},"lbs")).toBe(lb);});
