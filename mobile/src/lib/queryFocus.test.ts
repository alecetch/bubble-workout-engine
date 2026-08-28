/* @vitest-environment jsdom */

import { focusManager } from "@tanstack/react-query";
import { AppState } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initQueryFocusManagement } from "./queryFocus";

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("query focus management", () => {
  it("registers AppState as React Query's focus event listener", () => {
    const setFocused = vi.fn();
    const remove = vi.fn();
    vi.mocked(AppState.addEventListener).mockReturnValue({
      remove,
    } as ReturnType<typeof AppState.addEventListener>);
    const setEventListenerSpy = vi
      .spyOn(focusManager, "setEventListener")
      .mockImplementation(() => undefined);

    initQueryFocusManagement();

    expect(setEventListenerSpy).toHaveBeenCalledTimes(1);
    const capturedListener = setEventListenerSpy.mock.calls[0][0];
    const cleanup = capturedListener(setFocused);

    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(cleanup).toBe(remove);
  });

  it("maps AppState transitions to focused/unfocused", () => {
    const setFocused = vi.fn();
    const setEventListenerSpy = vi
      .spyOn(focusManager, "setEventListener")
      .mockImplementation(() => undefined);

    initQueryFocusManagement();

    const capturedListener = setEventListenerSpy.mock.calls[0][0];
    capturedListener(setFocused);
    const appStateHandler = vi.mocked(AppState.addEventListener).mock.calls[0][1];

    appStateHandler("active");
    appStateHandler("background");
    appStateHandler("inactive");

    expect(setFocused).toHaveBeenNthCalledWith(1, true);
    expect(setFocused).toHaveBeenNthCalledWith(2, false);
    expect(setFocused).toHaveBeenNthCalledWith(3, false);
  });
});
