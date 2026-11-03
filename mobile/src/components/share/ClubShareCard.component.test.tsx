import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ClubShareCard } from "./ClubShareCard";
vi.mock("../../config/brand", () => ({ BRAND_WORDMARK: "Test wordmark", BRAND_DOMAIN: "example.test" }));
it("separates club tier from actual days and renders the configured brand", () => {
  render(<ClubShareCard tier={250} count={263} year={2026} />);
  for (const label of ["CLUB 250", "263 days", "2026", "Test wordmark"]) expect(screen.getByText(label)).toBeInTheDocument();
});
it("preserves a first-year club label with a smaller actual count", () => {
  render(<ClubShareCard tier={100} count={25} year={2026} />);
  expect(screen.getByText("CLUB 100")).toBeInTheDocument();
  expect(screen.getByText("25 days")).toBeInTheDocument();
});
