import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useIsOffline } from "../../lib/network";
import { OfflineBanner } from "./OfflineBanner";

vi.mock("../../lib/network", () => ({
  useIsOffline: vi.fn(),
}));

const bannerText = "No internet connection - most changes will retry automatically";

describe("OfflineBanner", () => {
  it("renders nothing when online", () => {
    vi.mocked(useIsOffline).mockReturnValue(false);

    render(<OfflineBanner />);

    expect(screen.queryByText(bannerText)).not.toBeInTheDocument();
  });

  it("renders the offline message when offline", () => {
    vi.mocked(useIsOffline).mockReturnValue(true);

    render(<OfflineBanner />);

    expect(screen.getByText(bannerText)).toBeInTheDocument();
  });
});
