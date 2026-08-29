import React from "react";
import { render, waitFor } from "@testing-library/react";
import { withRepeat } from "react-native-reanimated";
import { SkeletonBlock } from "./SkeletonBlock";
import { shouldReduceMotion } from "../../utils/reduceMotion";

vi.mock("../../utils/reduceMotion", () => ({
  shouldReduceMotion: vi.fn(),
}));

const shouldReduceMotionMock = vi.mocked(shouldReduceMotion);
const withRepeatMock = vi.mocked(withRepeat);

describe("SkeletonBlock", () => {
  beforeEach(() => {
    shouldReduceMotionMock.mockReset();
    shouldReduceMotionMock.mockResolvedValue(false);
    withRepeatMock.mockClear();
  });

  it("renders with explicit width and height", () => {
    const { container } = render(<SkeletonBlock width={120} height={24} />);

    expect(container.firstChild).not.toBeNull();
  });

  it("renders with only height", () => {
    const { container } = render(<SkeletonBlock height={32} />);

    expect(container.firstChild).not.toBeNull();
  });

  it("produces DOM output for the loading placeholder", () => {
    const { container } = render(<SkeletonBlock height={16} />);

    expect(container.childElementCount).toBeGreaterThan(0);
  });

  it("starts a looping shimmer animation when reduce motion is disabled", async () => {
    render(<SkeletonBlock height={16} />);

    await waitFor(() => expect(withRepeatMock).toHaveBeenCalled());
    expect(withRepeatMock.mock.calls[0][1]).toBe(-1);
    expect(withRepeatMock.mock.calls[0][2]).toBe(true);
  });

  it("does not start the shimmer loop when reduce motion is enabled", async () => {
    shouldReduceMotionMock.mockResolvedValue(true);
    render(<SkeletonBlock height={16} />);

    await waitFor(() => expect(shouldReduceMotionMock).toHaveBeenCalled());
    expect(withRepeatMock).not.toHaveBeenCalled();
  });
});
