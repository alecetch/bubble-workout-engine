import { normalizeText } from "./normalizeText.js";
test("normalizeText trims leading and trailing whitespace", () => {
    expect(normalizeText("  hello world  ")).toBe("hello world");
});
test("normalizeText normalizes CRLF and CR to LF", () => {
    expect(normalizeText("line1\r\nline2\rline3")).toBe("line1\nline2\nline3");
});
test("normalizeText collapses three or more newlines to two", () => {
    expect(normalizeText("a\n\n\n\nb")).toBe("a\n\nb");
});
test("normalizeText preserves two newlines", () => {
    expect(normalizeText("a\n\nb")).toBe("a\n\nb");
});
test("normalizeText returns empty string for empty input", () => {
    expect(normalizeText("")).toBe("");
});
test("normalizeText leaves already-normalized text unchanged", () => {
    expect(normalizeText("Alpha\n\nBeta")).toBe("Alpha\n\nBeta");
});
