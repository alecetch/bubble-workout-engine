import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HyroxLandingPage } from "../pages/HyroxLandingPage";
import { trackEvent } from "../utils/api";

vi.mock("../utils/api", () => ({
  trackEvent: vi.fn(),
}));

describe("HyroxLandingPage", () => {
  test("renders all three cards with the correct links and tracks the view", () => {
    render(
      <MemoryRouter>
        <HyroxLandingPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Analyse my race").length).toBeGreaterThan(0);
    expect(screen.getByText("Predict my first HYROX")).toBeInTheDocument();
    expect(screen.getByText("Hit a target time")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^analyse my race$/i })).toHaveAttribute("href", "/hyrox-calculator/race-details");
    expect(screen.getByRole("link", { name: /predict my race time/i })).toHaveAttribute("href", "/hyrox-predictor");
    expect(screen.getByRole("link", { name: /analyse my race first/i })).toHaveAttribute("href", "/hyrox-calculator/race-details");
    expect(screen.getByRole("link", { name: /i already know my target/i })).toHaveAttribute("href", "/hyrox-calculator/race-details?mode=target");
    expect(trackEvent).toHaveBeenCalledWith("hyrox_landing_viewed");
  });
});
