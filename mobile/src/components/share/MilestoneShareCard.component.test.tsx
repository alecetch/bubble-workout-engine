import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MilestoneShareCard } from "./MilestoneShareCard";
vi.mock("../../config/brand", () => ({ BRAND_WORDMARK: "Test wordmark", BRAND_DOMAIN: "example.test" }));
it("renders the milestone count, year and configured wordmark", () => {
  render(<MilestoneShareCard count={100} year={2026} />);
  for (const label of ["100", "TRAINING DAYS", "2026", "Test wordmark", "example.test"]) expect(screen.getByText(label)).toBeInTheDocument();
});
it.each([200, 50])("uses the actual %s-day target in the I'm-in variant", count => {
  render(<MilestoneShareCard count={count} year={2027} isTarget />);
  expect(screen.getByText(String(count))).toBeInTheDocument();
  expect(screen.getByText("I'M IN FOR 2027")).toBeInTheDocument();
});
