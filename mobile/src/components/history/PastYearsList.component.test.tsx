import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PastYearsList } from "./PastYearsList";

describe("PastYearsList", () => {
  it("renders past years newest first with club labels or the count", () => {
    const years = [
      { year: 2023, count: 88, target: 200, best_club: null },
      { year: 2025, count: 214, target: 200, best_club: 200 },
      { year: 2026, count: 87, target: 200, best_club: null },
      { year: 2024, count: 260, target: 200, best_club: 250 },
      { year: 2022, count: 104, target: 200, best_club: 100 },
    ];
    render(<PastYearsList years={years} currentYear={2026} />);
    expect(screen.getByText("Past years")).toBeInTheDocument();
    const rows = screen.getAllByText(/^202[2-5] ·/);
    expect(rows.map(row => row.textContent)).toEqual(["2025 · 214 · 200", "2024 · 260 · Club 250", "2023 · 88", "2022 · 104 · Club 100"]);
    expect(screen.queryByText(/^2026 ·/)).not.toBeInTheDocument();
    expect(years[0].year).toBe(2023);
  });
  it.each([{ years: [] }, { years: [{ year: 2026, count: 0, target: 200, best_club: null }] }])("hides when there are no past years", ({ years }) => {
    const { container } = render(<PastYearsList years={years} currentYear={2026} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("retains last year's club after January rollover and opens its recap", () => {
    const open = vi.fn();
    render(<PastYearsList currentYear={2027} years={[{ year: 2026, count: 214, target: 200, best_club: 200 }]} onRecap={open} />);
    expect(screen.getByText("2026 \u00b7 214 \u00b7 200")).toBeInTheDocument();
    fireEvent.click(screen.getByText("2026 recap")); expect(open).toHaveBeenCalledWith(2026);
  });

});
