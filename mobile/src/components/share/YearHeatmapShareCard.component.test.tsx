import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { YearHeatmapShareCard } from "./YearHeatmapShareCard";
import { YearHeatmap } from "../history/YearHeatmap";
vi.mock("../../config/brand", () => ({ BRAND_WORDMARK: "Test wordmark", BRAND_DOMAIN: "example.test" }));
vi.mock("../history/YearHeatmap", () => ({ YearHeatmap: vi.fn(() => <div>Static year heatmap</div>) }));
it("renders counts/year/brand and sends only calendar data to the static heatmap", () => {
  const dates = ["2026-10-01", "2026-10-02"];
  render(<YearHeatmapShareCard year={2026} count={2} trainingDates={dates} todayLocal="2026-11-03" windowStart="2026-10-01" />);
  for (const label of ["2026", "2 TRAINING DAYS", "Test wordmark"]) expect(screen.getByText(label)).toBeInTheDocument();
  expect(vi.mocked(YearHeatmap).mock.calls[0][0]).toEqual({ year: 2026, trainingDates: dates, todayLocal: "2026-11-03", windowStart: "2026-10-01", presentation: "share" });
});
