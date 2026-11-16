import { beforeEach, expect, it, vi } from "vitest";
import { getJson } from "../api/client";
import { getAppStorage } from "../utils/appStorage";
import { decideGate, fetchVersionPolicy, resolveGate, BLOCK_KEY } from "./versionGate";
vi.mock("../api/client", () => ({ getJson: vi.fn() }));
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock("../utils/appStorage", () => ({ getAppStorage: vi.fn(() => storage) }));
const info = { platform: "ios" as const, version: "1.0.0", build: 17 };
const body = (min: unknown = 18, latest: unknown = 20) => ({ ok: true, ios: { min_build: min, latest_build: latest, update_url: "https://store.test/update" } });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getAppStorage).mockReturnValue(storage); storage.getItem.mockResolvedValue(null); storage.setItem.mockResolvedValue(undefined); storage.removeItem.mockResolvedValue(undefined); vi.mocked(getJson).mockResolvedValue(body()); });
it("decides on builds with minimum taking priority", () => {
 const policy = { minBuild: 14, latestBuild: 17, updateUrl: null };
 expect(decideGate(null, policy)).toBe("ok"); expect(decideGate(1, null)).toBe("ok");
 expect(decideGate(13, policy)).toBe("blocked"); expect(decideGate(14, policy)).toBe("soft_update");
 expect(decideGate(16, policy)).toBe("soft_update"); expect(decideGate(17, policy)).toBe("ok"); expect(decideGate(18, policy)).toBe("ok");
 expect(decideGate(14, { ...policy, latestBuild: null })).toBe("ok");
});
it.each([new Error("offline"), new Error("Network request timed out")])("fetch failures fail open", async error => { vi.mocked(getJson).mockRejectedValue(error); expect(await fetchVersionPolicy("ios")).toBeNull(); });
it.each([null, {}, { ok: true }, { ok: false, ios: {} }, { ok: true, ios: "bad" }])("malformed policy returns null", async value => { vi.mocked(getJson).mockResolvedValue(value); expect(await fetchVersionPolicy("ios")).toBeNull(); });
it("uses public getJson and its three-second timeout, validating fields", async () => { vi.mocked(getJson).mockResolvedValue(body(1.5, "20")); expect(await fetchVersionPolicy("ios")).toEqual({ minBuild: null, latestBuild: null, updateUrl: "https://store.test/update" }); expect(getJson).toHaveBeenCalledWith("/api/app-config", { timeoutMs: 3000 }); });
it("saves a block and clears it after a successful supported policy", async () => {
 expect((await resolveGate(info)).decision).toBe("blocked"); expect(storage.setItem).toHaveBeenCalledWith(BLOCK_KEY, JSON.stringify({ build: 17, minBuild: 18, updateUrl: "https://store.test/update" }));
 vi.mocked(getJson).mockResolvedValue(body(null, null)); expect((await resolveGate(info)).decision).toBe("ok"); expect(storage.removeItem).toHaveBeenCalledWith(BLOCK_KEY);
});
it.each([17, 16])("uses saved offline block only for current build %i", async build => { vi.mocked(getJson).mockRejectedValue(new Error("offline")); storage.getItem.mockResolvedValue(JSON.stringify({ build, minBuild: 18, updateUrl: "https://store.test" })); expect((await resolveGate(info)).decision).toBe(build === 17 ? "blocked" : "ok"); });
it("handles storage read, write, remove and initialization failures", async () => {
 storage.setItem.mockRejectedValue(new Error("disk")); expect((await resolveGate(info)).decision).toBe("blocked");
 vi.mocked(getJson).mockRejectedValue(new Error("offline")); storage.getItem.mockRejectedValue(new Error("disk")); expect((await resolveGate(info)).decision).toBe("ok");
 vi.mocked(getAppStorage).mockImplementation(() => { throw Error("unavailable"); }); expect((await resolveGate(info)).decision).toBe("ok");
 vi.mocked(getJson).mockResolvedValue(body(null, null)); expect((await resolveGate(info)).decision).toBe("ok");
});
it("ignores saved blocks for unknown build and other platforms without fetching", async () => { expect((await resolveGate({ ...info, build: null })).decision).toBe("ok"); expect((await resolveGate({ ...info, platform: "other" })).decision).toBe("ok"); expect(getJson).not.toHaveBeenCalled(); });
