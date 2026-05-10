import { toTitleCase } from "./text.js";
test("toTitleCase converts space-separated words", () => {
    expect(toTitleCase("hello world")).toBe("Hello World");
});
test("toTitleCase converts underscore-separated words", () => {
    expect(toTitleCase("hello_world")).toBe("Hello World");
});
test("toTitleCase converts hyphen-separated words", () => {
    expect(toTitleCase("hello-world")).toBe("Hello World");
});
test("toTitleCase normalizes uppercase text", () => {
    expect(toTitleCase("UPPER CASE")).toBe("Upper Case");
});
test("toTitleCase returns empty string for empty input", () => {
    expect(toTitleCase("")).toBe("");
});
test("toTitleCase capitalizes a single word", () => {
    expect(toTitleCase("single")).toBe("Single");
});
test("toTitleCase preserves already-title-cased text", () => {
    expect(toTitleCase("Hello World")).toBe("Hello World");
});
