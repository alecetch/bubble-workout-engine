import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HyroxLandingPage } from "../pages/HyroxLandingPage";

describe("HyroxLandingPage", () => {
  test("renders both calculator cards with links", () => {
    render(
      <MemoryRouter>
        <HyroxLandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Analyse my result")).toBeInTheDocument();
    expect(screen.getByText("Predict my time")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /analyse my result/i })).toHaveAttribute("href", "/hyrox-calculator");
    expect(screen.getByRole("link", { name: /get my prediction/i })).toHaveAttribute("href", "/hyrox-predictor");
  });
});
