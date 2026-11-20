import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchHyroxSubmissionDraft, trackEvent } from "../utils/api";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.history.replaceState(null, "", "/"); });
describe("submission draft API", () => {
  for (const token of [undefined, "abc"]) test(`uses header only when given a restore token: ${Boolean(token)}`, async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ restoredScope: token ? "full" : "race_only" }) }); vi.stubGlobal("fetch", fetch);
    await fetchHyroxSubmissionDraft("submission", token);
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/hyrox\/submission-draft\/submission$/);
    expect(String(fetch.mock.calls[0][0])).not.toContain("abc");
    expect(fetch.mock.calls[0][1]).toEqual(token ? { headers: { "X-Restore-Token": token } } : undefined);
  });
  test("analytics URLs omit restore-token fragments", () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch); vi.stubEnv("VITE_ANALYTICS_KEY", "example.test");
    window.history.replaceState(null, "", "/hyrox-calculator/race-details#rt=abc"); trackEvent("hyrox_calculator_started");
    expect(fetch).toHaveBeenCalled(); expect(JSON.stringify(fetch.mock.calls)).not.toContain("abc");
  });
});
