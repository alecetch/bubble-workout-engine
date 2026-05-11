import React from "react";
import { render } from "@testing-library/react";
import { SkeletonBlock } from "./SkeletonBlock";

describe("SkeletonBlock", () => {
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
});
