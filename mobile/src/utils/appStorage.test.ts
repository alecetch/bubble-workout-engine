import { describe, expect, it } from "vitest";
import { getAppStorage } from "./appStorage";

describe("getAppStorage", () => {
  it("returns the persistent storage interface", () => {
    const storage = getAppStorage();

    expect(typeof storage.getItem).toBe("function");
    expect(typeof storage.setItem).toBe("function");
    expect(typeof storage.removeItem).toBe("function");
  });
});
