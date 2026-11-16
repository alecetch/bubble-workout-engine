import { describe, expect, it } from "vitest";
import { maskEmail } from "../maskEmail";

describe("maskEmail", () => {
  it.each([["alex@outlook.com", "a•••@outlook.com"], ["a@x.com", "a•••@x.com"]])("masks %s", (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });
  it.each(["", "invalid", "a@", "@x.com", "a@@x.com", "a@x", "a b@x.com", "a@x.com\n"])("hides invalid input %s", email => {
    expect(maskEmail(email)).toBe("");
  });
});
