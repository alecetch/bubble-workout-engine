import { toggleInjuryFlag } from "./toggleInjuryFlag.js";
const NONE = "No known issues";
test("toggleInjuryFlag adds a new flag when none are selected", () => {
    expect(toggleInjuryFlag([], "Shoulder issues", NONE)).toEqual(["Shoulder issues"]);
});
test("toggleInjuryFlag adds a second flag alongside an existing one", () => {
    expect(toggleInjuryFlag(["Shoulder issues"], "Knee issues", NONE)).toEqual(["Shoulder issues", "Knee issues"]);
});
test("toggleInjuryFlag removes an already selected flag", () => {
    expect(toggleInjuryFlag(["Shoulder issues"], "Shoulder issues", NONE)).toEqual([]);
});
test("toggleInjuryFlag selects noneSlug when it was not selected", () => {
    expect(toggleInjuryFlag([], NONE, NONE)).toEqual([NONE]);
});
test("toggleInjuryFlag clears noneSlug when it was already selected", () => {
    expect(toggleInjuryFlag([NONE], NONE, NONE)).toEqual([]);
});
test("toggleInjuryFlag removes noneSlug when adding a specific flag", () => {
    expect(toggleInjuryFlag([NONE], "Shoulder issues", NONE)).toEqual(["Shoulder issues"]);
});
test("toggleInjuryFlag replaces other flags when clicking noneSlug", () => {
    expect(toggleInjuryFlag(["Shoulder issues", "Knee issues"], NONE, NONE)).toEqual([NONE]);
});
test("toggleInjuryFlag ignores empty clicked values", () => {
    expect(toggleInjuryFlag(["Shoulder issues"], "", NONE)).toEqual(["Shoulder issues"]);
});
test("toggleInjuryFlag deduplicates existing values", () => {
    expect(toggleInjuryFlag(["Shoulder issues", "Shoulder issues"], "Knee issues", NONE)).toEqual(["Shoulder issues", "Knee issues"]);
});
