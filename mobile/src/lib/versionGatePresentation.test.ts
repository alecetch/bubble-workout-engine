import { beforeEach, expect, it, vi } from "vitest";
import { BRAND_WORDMARK } from "../config/brand";
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("../utils/appStorage", () => ({ getAppStorage: () => storage }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); storage.getItem.mockResolvedValue(null); storage.setItem.mockResolvedValue(undefined); });
it("block wins over signed-in, signed-out and unreachable startup, and splash waits for both checks", async () => {
 const { selectRootView, isStartupReady } = await import("./versionGatePresentation");
 for (const restoration of ["ready", "restoring", "unreachable"]) expect(selectRootView("blocked", restoration)).toBe("force_update");
 expect(selectRootView("ok", "ready")).toBe("navigation"); expect(selectRootView("ok", "unreachable")).toBe("unreachable");
 expect(isStartupReady("checking", "ready")).toBe(false); expect(isStartupReady("ok", "restoring")).toBe(false); expect(isStartupReady("ok", "ready")).toBe(true);
});
it("prompts once per latest build only on safe tab roots", async () => {
 const { maybeShowSoftUpdate } = await import("./versionGatePresentation");
 const show = vi.fn(), openUrl = vi.fn().mockResolvedValue(undefined);
 let route = { name: "ProgramDay", tab: "HomeTab" };
 const options = { getRoute: () => route, show, openUrl };
 const gate = { state: "soft_update" as const, latestBuild: 20, updateUrl: "https://store.test" };
 expect(await maybeShowSoftUpdate(gate, options)).toBe(false);
 route = { name: "Step1Goals", tab: "HomeTab" }; expect(await maybeShowSoftUpdate(gate, options)).toBe(false);
 route = { name: "ProgramReview", tab: "HomeTab" }; expect(await maybeShowSoftUpdate(gate, options)).toBe(true);
 expect(show).toHaveBeenCalledWith("Update available", `A newer version of ${BRAND_WORDMARK} is available.`, expect.any(Array));
 expect(storage.setItem).toHaveBeenCalledWith("versionGate.softPromptShownFor", "20");
 expect(await maybeShowSoftUpdate(gate, options)).toBe(false);
 show.mock.calls[0][2][1].onPress(); expect(openUrl).toHaveBeenCalledWith("https://store.test");
 expect(await maybeShowSoftUpdate({ ...gate, latestBuild: 21 }, options)).toBe(true);
});
it("honors persisted dismissal and rejects unsafe nested routes", async () => {
 const { maybeShowSoftUpdate, isSoftPromptRoute } = await import("./versionGatePresentation");
 storage.getItem.mockResolvedValue("20"); const show = vi.fn();
 expect(await maybeShowSoftUpdate({ state: "soft_update", latestBuild: 20, updateUrl: "https://store.test" }, { getRoute: () => ({ name: "Settings", tab: "SettingsTab" }), show, openUrl: vi.fn() })).toBe(false);
 for (const [tab, name] of [["HomeTab", "ProgramDashboard"], ["ProgramsTab", "ProgramHub"], ["TodayTab", "TodayTab"], ["HistoryTab", "HistoryMain"], ["SettingsTab", "Settings"]]) expect(isSoftPromptRoute({ tab, name })).toBe(true);
 expect(isSoftPromptRoute({ tab: "ProgramsTab", name: "ProgramDashboard" })).toBe(false); expect(show).not.toHaveBeenCalled();
});
