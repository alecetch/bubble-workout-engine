/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { shouldReduceMotion } from "../../utils/reduceMotion";
import { usePressScale } from "./usePressScale";

vi.mock("react-native-reanimated", () => ({
  Easing: {
    ease: vi.fn(),
    out: vi.fn((easing: unknown) => easing),
  },
  interpolate: vi.fn((value: number, input: number[], output: number[]) => {
    const index = input.indexOf(value);
    return index >= 0 ? output[index] : output[0];
  }),
  useAnimatedStyle: vi.fn((fn: () => unknown) => fn()),
  useSharedValue: vi.fn((value: unknown) => ({ value })),
  withTiming: vi.fn((value: unknown) => value),
}));
vi.mock("../../utils/reduceMotion", () => ({
  shouldReduceMotion: vi.fn(),
}));

const shouldReduceMotionMock = vi.mocked(shouldReduceMotion);

describe("usePressScale", () => {
  beforeEach(() => {
    shouldReduceMotionMock.mockReset();
  });

  it("locks scale to 1 and skips animation when reduce motion is enabled", async () => {
    shouldReduceMotionMock.mockResolvedValue(true);
    const { result } = renderHook(() => usePressScale());

    await act(async () => {});

    expect(result.current.reduceMotionEnabled).toBe(true);
    act(() => result.current.onPressIn());
    expect(result.current.animatedStyle).toEqual({ transform: [{ scale: 1 }] });
  });

  it("does not throw when pressed while disabled", async () => {
    shouldReduceMotionMock.mockResolvedValue(false);
    const { result } = renderHook(() => usePressScale({ disabled: true }));

    await act(async () => {});

    expect(() => act(() => result.current.onPressIn())).not.toThrow();
    expect(result.current.reduceMotionEnabled).toBe(false);
  });

  it("resolves reduceMotionEnabled from shouldReduceMotion on mount", async () => {
    shouldReduceMotionMock.mockResolvedValue(false);
    const { result } = renderHook(() => usePressScale());

    await act(async () => {});

    expect(shouldReduceMotionMock).toHaveBeenCalledTimes(1);
    expect(result.current.reduceMotionEnabled).toBe(false);
  });
});
