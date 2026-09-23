import React from "react";
import { render, screen } from "@testing-library/react";
import { withRepeat } from "react-native-reanimated";
import { SkeletonBlock } from "./SkeletonBlock";

describe("SkeletonBlock", () => {
  beforeEach(() => vi.mocked(withRepeat).mockClear());

  it("renders the supplied dimensions and test ID", () => {
    render(<SkeletonBlock width={120} height={24} testID="placeholder" />);
    expect(screen.getByTestId("placeholder")).toHaveStyle({ width: "120px", height: "24px" });
  });

  it("defaults to full width and preserves custom styles", () => {
    render(<SkeletonBlock height={32} borderRadius={8} style={{ opacity: 0.5 }} testID="placeholder" />);
    expect(screen.getByTestId("placeholder")).toHaveStyle({ width: "100%", height: "32px", opacity: "0.5" });
  });

  it("can mount and unmount quickly without starting a repeating animation", () => {
    const { unmount } = render(<SkeletonBlock height={16} />);
    unmount();
    expect(withRepeat).not.toHaveBeenCalled();
  });
});
