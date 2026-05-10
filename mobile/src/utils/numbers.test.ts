import { clamp, parseNumberOrNull } from "./numbers.js";
test("parseNumberOrNull parses whole numbers", () => {
    expect(parseNumberOrNull("42")).toBe(42);
});
test("parseNumberOrNull parses decimals", () => {
    expect(parseNumberOrNull("3.14")).toBe(3.14);
});
test("parseNumberOrNull returns null for empty string", () => {
    expect(parseNumberOrNull("")).toBe(null);
});
test("parseNumberOrNull returns null for whitespace", () => {
    expect(parseNumberOrNull("  ")).toBe(null);
});
test("parseNumberOrNull returns null for non-numeric input", () => {
    expect(parseNumberOrNull("abc")).toBe(null);
});
test("parseNumberOrNull preserves zero", () => {
    expect(parseNumberOrNull("0")).toBe(0);
});
test("parseNumberOrNull parses negative values", () => {
    expect(parseNumberOrNull("-5")).toBe(-5);
});
test("parseNumberOrNull returns null for null-like input", () => {
    expect(parseNumberOrNull(null as unknown as string)).toBe(null);
});
test("clamp returns value when already within range", () => {
    expect(clamp(5, 1, 10)).toBe(5);
});
test("clamp returns min when value is below range", () => {
    expect(clamp(-1, 1, 10)).toBe(1);
});
test("clamp returns max when value is above range", () => {
    expect(clamp(11, 1, 10)).toBe(10);
});
test("clamp preserves exact min boundary", () => {
    expect(clamp(1, 1, 10)).toBe(1);
});
test("clamp preserves exact max boundary", () => {
    expect(clamp(10, 1, 10)).toBe(10);
});
