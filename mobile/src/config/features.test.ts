import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("physique build flag", () => {
  it.each([undefined, "false", "TRUE", "1", "true"])("enables only literal true (%s)", async value => {
    vi.stubEnv("EXPO_PUBLIC_PHYSIQUE_ENABLED", value);
    vi.resetModules();
    expect((await import("./features")).PHYSIQUE_ENABLED).toBe(value === "true");
  });
});
