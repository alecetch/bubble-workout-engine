import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { colors } from "../../theme/colors";
import { YearHeatmap } from "./YearHeatmap";

const native = vi.hoisted(() => ({ scrollTo: vi.fn(), layout: undefined as undefined | ((event: any) => void) }));
vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    useWindowDimensions: () => ({ width: 375, height: 812 }),
    View: ({ children, testID, accessibilityLabel, accessibilityRole, onLayout }: any) => {
      native.layout = onLayout;
      return <div data-testid={testID} role={accessibilityRole === "image" ? "img" : undefined} aria-label={accessibilityLabel}>{children}</div>;
    },
    ScrollView: React.forwardRef(({ children, scrollEnabled }: any, ref) => {
      React.useImperativeHandle(ref, () => ({ scrollTo: native.scrollTo }));
      return <div data-testid="heatmap-scroll" data-scroll-enabled={scrollEnabled}>{children}</div>;
    }),
  };
});
vi.mock("react-native-svg", () => ({
  default: ({ children, width, height }: any) => <svg width={width} height={height}>{children}</svg>,
  G: ({ children, testID }: any) => <g data-testid={testID}>{children}</g>,
  Text: ({ children, x, y }: any) => <text x={x} y={y}>{children}</text>,
  Rect: ({ testID, onPress, accessible, ...props }: any) => <rect data-testid={testID} onClick={onPress} aria-hidden={accessible === false} {...props} />,
}));

const props = { year: 2026, trainingDates: ["2026-10-01", "2026-10-02", "2026-08-01"], todayLocal: "2026-10-15" };
describe("YearHeatmap", () => {
  it("exports a whole leap year in larger static cells without scrolling or day interactions", () => {
    const press = vi.fn();
    render(<YearHeatmap year={2024} trainingDates={["2024-02-29"]} todayLocal="2024-12-31" presentation="share" onDayPress={press} />);
    expect(screen.queryByTestId("heatmap-scroll")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^year-day-/)).toHaveLength(366);
    expect(screen.getByTestId("year-day-2024-02-29")).toHaveAttribute("width", "10");
    fireEvent.click(screen.getByTestId("year-day-2024-02-29"));
    expect(press).not.toHaveBeenCalled();
    expect(screen.getByTestId("year-day-2024-12-31")).toBeInTheDocument();
  });
  beforeEach(() => { native.scrollTo.mockClear(); });

  it.each([[2026, 53, 365], [2028, 53, 366], [2012, 54, 366]])("renders every date of %i in Monday-first weeks", (year, weeks, days) => {
    const { container } = render(<YearHeatmap {...props} year={year} />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.getAllByTestId(/^year-week-/)).toHaveLength(weeks);
    expect(screen.getAllByTestId(/^year-day-/)).toHaveLength(days);
    expect(screen.getByTestId(`year-day-${year}-12-31`)).toBeInTheDocument();
    if (days === 366) expect(screen.getByTestId(`year-day-${year}-02-29`)).toBeInTheDocument();
  });
  it("places Monday in the first row and labels the months", () => {
    render(<YearHeatmap {...props} />);
    expect(screen.getByTestId("year-day-2026-01-05")).toHaveAttribute("y", "18");
    expect(Number(screen.getByTestId("year-day-2026-01-01").getAttribute("y"))).toBeGreaterThan(18);
    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("Dec")).toBeInTheDocument();
  });
  it("fills trained dates, mutes untrained days and outlines future dates", () => {
    render(<YearHeatmap {...props} trainingDates={[...props.trainingDates, "2026-12-01"]} />);
    expect(screen.getByTestId("year-day-2026-10-01")).toHaveAttribute("fill", colors.accent);
    expect(screen.getByTestId("year-day-2026-10-03")).toHaveAttribute("fill", colors.border);
    expect(screen.getByTestId("year-day-2026-12-01")).toHaveAttribute("fill", "none");
    expect(screen.getByTestId("year-day-2026-12-01")).toHaveAttribute("stroke", colors.textSecondary);
  });
  it("hides pre-window dates and excludes them from the summary", () => {
    render(<YearHeatmap {...props} windowStart="2026-10-01" />);
    expect(screen.queryByTestId("year-day-2026-09-30")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 training days in 2026; best month October with 2" })).toBeInTheDocument();
  });
  it("offers one accessible summary, deduplicating valid visible training dates", () => {
    render(<YearHeatmap {...props} trainingDates={[...props.trainingDates, "2026-10-01", "2025-10-01", "2026-02-30"]} />);
    expect(screen.getByRole("img", { name: "3 training days in 2026; best month October with 2" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByTestId("year-day-2026-10-01")).toHaveAttribute("aria-hidden", "true");
  });
  it("summarises an empty year without inventing a best month", () => {
    render(<YearHeatmap {...props} trainingDates={[]} />);
    expect(screen.getByRole("img", { name: "0 training days in 2026" })).toBeInTheDocument();
  });
  it("calls onDayPress with the selected ISO date", () => {
    const onDayPress = vi.fn();
    render(<YearHeatmap {...props} onDayPress={onDayPress} />);
    fireEvent.click(screen.getByTestId("year-day-2026-10-01"));
    expect(onDayPress).toHaveBeenCalledWith("2026-10-01");
  });
  it("scrolls a narrow grid to the current week after layout and fits wider layouts", () => {
    render(<YearHeatmap {...props} />);
    act(() => native.layout?.({ nativeEvent: { layout: { width: 240 } } }));
    expect(screen.getByTestId("heatmap-scroll")).toHaveAttribute("data-scroll-enabled", "true");
    expect(native.scrollTo).toHaveBeenCalledWith({ x: 76, animated: false });
    act(() => native.layout?.({ nativeEvent: { layout: { width: 480 } } }));
    expect(screen.getByTestId("heatmap-scroll")).toHaveAttribute("data-scroll-enabled", "false");
  });
});
