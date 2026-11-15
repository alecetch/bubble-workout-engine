import { expect, it, vi } from "vitest";
import { BRAND_DOMAIN, BRAND_WORDMARK } from "./brand";

vi.unmock("./brand");

it("uses the live domain and app wordmark without brand mocks", () => {
  expect(BRAND_DOMAIN).toBe("200days.app");
  expect(BRAND_WORDMARK).toBe("200 Days");
});
