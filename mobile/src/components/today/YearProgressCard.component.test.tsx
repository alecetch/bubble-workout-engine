import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { normalizeYearProgress } from "../../api/yearProgress";
import { YearProgressCard } from "./YearProgressCard";

const progress = normalizeYearProgress({ ok: true, year: 2026, count: 87, target: 200, pace_status: "ahead", pace_delta: 3.3, projected_year_end: 212 });
const props = () => ({ progress, onRetry: vi.fn(), onPress: vi.fn() });

describe("YearProgressCard", () => {
  it("renders the count, target, pace and one accessible summary that opens History", () => {
    const p = props();
    render(<YearProgressCard {...p} />);
    expect(screen.getByText("87")).toBeInTheDocument();
    expect(screen.getByText("of 200")).toBeInTheDocument();
    expect(screen.getByText("3 ahead · on track for ~212")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "87 of 200 training days this year, 3 ahead of pace" }));
    expect(p.onPress).toHaveBeenCalledOnce();
  });
  it("renders behind and pro-rated states", () => {
    render(<YearProgressCard {...props()} progress={{ ...progress, target: 50, pro_rated: true, pace_status: "behind", pace_delta: -2 }} />);
    expect(screen.getByText("of 50")).toBeInTheDocument();
    expect(screen.getByText("2 behind · two extra sessions this fortnight closes it")).toBeInTheDocument();
    expect(screen.getByText("Your 2026 target: 50 days. Next year it's 200.")).toBeInTheDocument();
  });
  it("renders a stable skeleton while loading", () => {
    render(<YearProgressCard {...props()} progress={undefined} isLoading />);
    expect(screen.getByTestId("year-progress-loading")).toHaveStyle({ height: "200px" });
    expect(screen.queryByText("87")).not.toBeInTheDocument();
  });
  it("offers retry on error without showing a false count", () => {
    const p = props();
    render(<YearProgressCard {...p} isError />);
    expect(screen.getByText("Couldn't load your year")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading your year" }));
    expect(p.onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText("87")).not.toBeInTheDocument();
  });
});
