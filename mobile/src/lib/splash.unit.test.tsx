import React from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as SplashScreen from "expo-splash-screen";
import { preventSplashAutoHide, useHideSplashWhenReady } from "./splash";
vi.mock("expo-splash-screen", () => ({ preventAutoHideAsync: vi.fn(), hideAsync: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(SplashScreen.preventAutoHideAsync).mockReset().mockResolvedValue(true);
  vi.mocked(SplashScreen.hideAsync).mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());
describe("native splash lifecycle", () => {
  it("prevents automatic hiding and handles a native rejection", async () => {
    vi.mocked(SplashScreen.preventAutoHideAsync).mockRejectedValueOnce(new Error("already hidden"));
    preventSplashAutoHide();
    await act(async () => {});
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
  });
  for (const outcome of ["ready", "unreachable"] as const) it(`hides exactly once when restoration becomes ${outcome}`, () => {
    const { rerender } = renderHook(({ state }) => useHideSplashWhenReady(state !== "restoring"), {
      initialProps: { state: "restoring" as "restoring" | "ready" | "unreachable" },
    });
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    rerender({ state: outcome });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(10000));
    rerender({ state: "restoring" });
    rerender({ state: outcome });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
  it("hides after five seconds when restoration never settles", () => {
    const { rerender } = renderHook(({ ready }) => useHideSplashWhenReady(ready), { initialProps: { ready: false } });
    act(() => vi.advanceTimersByTime(4999));
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    rerender({ ready: true });
    act(() => vi.advanceTimersByTime(10000));
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
  it("cancels the timeout on unmount", () => {
    const { unmount } = renderHook(() => useHideSplashWhenReady(false));
    unmount();
    act(() => vi.advanceTimersByTime(5000));
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });
  it("hides only once under StrictMode and tolerates a hide rejection", async () => {
    vi.mocked(SplashScreen.hideAsync).mockRejectedValueOnce(new Error("native unavailable"));
    renderHook(() => useHideSplashWhenReady(true), { wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode> });
    await act(async () => {});
    act(() => vi.advanceTimersByTime(5000));
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
});
