/* @vitest-environment jsdom */

import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initNetworkMonitoring, useIsOffline } from "./network";

vi.mock("@react-native-community/netinfo", () => ({
  default: { addEventListener: vi.fn(() => vi.fn()), configure: vi.fn() },
}));

beforeEach(() => {
  onlineManager.setOnline(true);
  vi.mocked(NetInfo.addEventListener).mockImplementation(() => vi.fn());
});

afterEach(() => {
  onlineManager.setOnline(true);
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("network monitoring", () => {
  it("registers NetInfo as React Query's online event listener", () => {
    const setOnline = vi.fn();
    const unsubscribe = vi.fn();
    vi.mocked(NetInfo.addEventListener).mockReturnValue(unsubscribe);
    const setEventListenerSpy = vi
      .spyOn(onlineManager, "setEventListener")
      .mockImplementation(() => undefined);

    initNetworkMonitoring();

    expect(setEventListenerSpy).toHaveBeenCalledTimes(1);
    const capturedListener = setEventListenerSpy.mock.calls[0][0];
    const cleanup = capturedListener(setOnline);
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);

    const netInfoListener = vi.mocked(NetInfo.addEventListener).mock.calls[0][0];
    netInfoListener({ isConnected: false } as Parameters<typeof netInfoListener>[0]);
    netInfoListener({ isConnected: true } as Parameters<typeof netInfoListener>[0]);

    expect(setOnline).toHaveBeenNthCalledWith(1, false);
    expect(setOnline).toHaveBeenNthCalledWith(2, true);
    expect(cleanup).toBe(unsubscribe);
  });

  it("disables netinfo's background internet-reachability polling", () => {
    initNetworkMonitoring();

    expect(NetInfo.configure).toHaveBeenCalledTimes(1);
    const config = vi.mocked(NetInfo.configure).mock.calls[0][0];
    expect(config.reachabilityShouldRun?.()).toBe(false);
  });

  it("skips netinfo entirely when EXPO_PUBLIC_DISABLE_NETWORK_MONITORING is set", () => {
    vi.stubEnv("EXPO_PUBLIC_DISABLE_NETWORK_MONITORING", "true");
    const setEventListenerSpy = vi
      .spyOn(onlineManager, "setEventListener")
      .mockImplementation(() => undefined);

    initNetworkMonitoring();

    expect(NetInfo.configure).not.toHaveBeenCalled();
    expect(setEventListenerSpy).not.toHaveBeenCalled();
    expect(NetInfo.addEventListener).not.toHaveBeenCalled();
  });

  it("returns true initially when React Query is offline", () => {
    onlineManager.setOnline(false);

    const { result } = renderHook(() => useIsOffline());

    expect(result.current).toBe(true);
  });

  it("returns false initially when React Query is online", () => {
    onlineManager.setOnline(true);

    const { result } = renderHook(() => useIsOffline());

    expect(result.current).toBe(false);
  });

  it("updates when React Query's online state changes", () => {
    onlineManager.setOnline(true);
    const { result } = renderHook(() => useIsOffline());

    expect(result.current).toBe(false);

    act(() => {
      onlineManager.setOnline(false);
    });

    expect(result.current).toBe(true);
  });
});
