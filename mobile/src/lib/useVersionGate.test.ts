/* @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { AppState } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolveGate } from "./versionGate";
import { useVersionGate } from "./useVersionGate";
vi.mock("react-native", () => ({ AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock("./versionGate", () => ({ resolveGate: vi.fn() }));
const ok = { decision: "ok" as const, updateUrl: null, latestBuild: null };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T12:00Z")); vi.clearAllMocks(); vi.mocked(resolveGate).mockResolvedValue(ok); });
afterEach(() => vi.useRealTimers());
const foreground = () => vi.mocked(AppState.addEventListener).mock.calls[0][1]("active");
it("settles initial check and cleans up", async () => { const { result, unmount } = renderHook(useVersionGate); expect(result.current.state).toBe("checking"); await act(async () => {}); expect(result.current.state).toBe("ok"); unmount(); expect(vi.mocked(AppState.addEventListener).mock.results[0].value.remove).toHaveBeenCalled(); });
it("checks on foreground only after 30 minutes and can lift a block", async () => {
 vi.mocked(resolveGate).mockResolvedValueOnce({ decision: "blocked", updateUrl: "https://store.test", latestBuild: 20 });
 const { result } = renderHook(useVersionGate); await act(async () => {}); expect(result.current.state).toBe("blocked");
 await act(async () => { foreground(); }); expect(resolveGate).toHaveBeenCalledTimes(1);
 await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1); foreground(); });
 expect(resolveGate).toHaveBeenCalledTimes(2); expect(result.current.state).toBe("ok");
});
it("only runs one pending check", async () => { vi.mocked(resolveGate).mockReturnValue(new Promise(() => {})); renderHook(useVersionGate); await act(async () => { foreground(); foreground(); }); expect(resolveGate).toHaveBeenCalledTimes(1); });
it("settles a hung check in four seconds and ignores late completion", async () => {
 let resolve!: (value: Awaited<ReturnType<typeof resolveGate>>) => void; vi.mocked(resolveGate).mockReturnValue(new Promise(done => { resolve = done; }));
 const { result } = renderHook(useVersionGate); await act(async () => { await vi.advanceTimersByTimeAsync(4000); }); expect(result.current.state).toBe("ok");
 await act(async () => resolve({ decision: "blocked", updateUrl: null, latestBuild: null })); expect(result.current.state).toBe("ok");
});
