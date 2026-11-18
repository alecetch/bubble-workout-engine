/** @vitest-environment jsdom */
import { renderHook, act } from "@testing-library/react";
import { BackHandler } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";
import { useReviewEditBack } from "./useReviewEditBack";

vi.mock("@react-navigation/native", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]) };
});
vi.mock("react-native", () => ({
  BackHandler: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
beforeEach(() => vi.clearAllMocks());

it("consumes edit hardware Back, discards without preserveDraft and cleans up", () => {
  const navigation = { replace: vi.fn() }, normalBack = vi.fn();
  const { unmount } = renderHook(() => useReviewEditBack(true, navigation, normalBack));
  const [event, handler] = vi.mocked(BackHandler.addEventListener).mock.calls[0];
  expect(event).toBe("hardwareBackPress");
  act(() => { expect(handler({} as never)).toBe(true); });
  expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("ProgramReview");
  expect(normalBack).not.toHaveBeenCalled();
  unmount();
  expect(vi.mocked(BackHandler.addEventListener).mock.results[0].value.remove).toHaveBeenCalled();
});

it("leaves normal onboarding hardware Back alone and retains its scaffold action", () => {
  const navigation = { replace: vi.fn() }, normalBack = vi.fn();
  const { result } = renderHook(() => useReviewEditBack(false, navigation, normalBack));
  act(() => result.current());
  expect(normalBack).toHaveBeenCalledOnce();
  expect(BackHandler.addEventListener).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalled();
});
