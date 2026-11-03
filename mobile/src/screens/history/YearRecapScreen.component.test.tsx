import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { YearRecapScreen } from "./YearRecapScreen";
import { useYearRecap } from "../../api/hooks/yearRecapHooks";
import { renderWithProviders } from "../../__test-utils__";

vi.unmock("@tanstack/react-query");
vi.mock("../../api/hooks/yearRecapHooks", () => ({ useYearRecap: vi.fn() }));
vi.mock("@react-navigation/native", async () => {
  const React = await import("react");
  return { useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]) };
});
const sharing = vi.hoisted(() => ({ shareCard: vi.fn().mockResolvedValue(undefined), isSharing: false }));
vi.mock("../../components/share/useShareCard", () => ({ useShareCard: () => ({ ...sharing, shareView: null }) }));
vi.mock("../../components/history/YearHeatmap", () => ({ YearHeatmap: () => <div>Full-year heatmap</div> }));
vi.mock("../../components/interaction/PressableScale", () => ({ PressableScale: ({ children, onPress, disabled }: any) => <button disabled={disabled} onClick={onPress}>{children}</button> }));
const recap = { ok: true, year: 2026, count: 214, target: 200, pro_rated: false, best_club: 200,
  best_month: { month: 10, count: 22 }, busiest_weekday: "Tuesday", longest_on_pace_weeks: 17,
  sessions_count: 231, personal_records_count: 12, training_dates: ["2026-01-03"], today_local: "2026-12-28", window_start: "2026-01-01", window_end: "2026-12-31" };
const back = vi.fn();
function renderScreen() { return renderWithProviders(<YearRecapScreen route={{ params: { year: 2026 } } as any} navigation={{ goBack: back } as any} />); }
beforeEach(() => {
  sharing.shareCard.mockClear(); sharing.isSharing = false; back.mockClear();
  vi.mocked(useYearRecap).mockReturnValue({ data: recap, refetch: vi.fn() } as any);
});
it("renders the story panels and club without punitive copy", () => {
  renderScreen();
  for (const text of ["2026. 214 training days.", "Club 200.", "Full-year heatmap", "October was your best month. 22 training days.",
    "Tuesday was your busiest training day.", "17 weeks on pace in a row", "231 sessions.", "12 personal records.", "2027 starts 1 January. Day 1 is yours."]) expect(screen.getByText(text)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\b(fail|missed|lost)\b/i);
});
it("celebrates a below-target year and retains any earned club", () => {
  vi.mocked(useYearRecap).mockReturnValue({ data: { ...recap, count: 143, best_club: 100 } } as any);
  renderScreen();
  expect(screen.getByText("143 training days. That's 143 more than zero.")).toBeInTheDocument();
  expect(screen.getByText("Club 100.")).toBeInTheDocument();
});
it("shares the selected calendar data through the existing hook", () => {
  renderScreen(); fireEvent.click(screen.getByText("Share your year"));
  expect(sharing.shareCard).toHaveBeenCalledWith({ type: "year", year: 2026, count: 214, trainingDates: recap.training_dates, todayLocal: recap.today_local, windowStart: undefined });
  fireEvent.click(screen.getByText("Back to History")); expect(back).toHaveBeenCalledOnce();
});
it("shows loading without sharing stale data", () => {
  vi.mocked(useYearRecap).mockReturnValue({ isLoading: true } as any);
  renderScreen(); expect(screen.getByText("Loading your recap...")).toBeInTheDocument(); expect(screen.queryByText("Share your year")).not.toBeInTheDocument();
});
it("shows an API error with retry", () => {
  const retry = vi.fn();
  vi.mocked(useYearRecap).mockReturnValue({ isError: true, error: new Error("Recap unavailable"), refetch: retry } as any);
  renderScreen(); expect(screen.getByText("Recap unavailable")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Retry")); expect(retry).toHaveBeenCalledOnce();
});
it("renders a zero-session year without undefined statistics", () => {
  vi.mocked(useYearRecap).mockReturnValue({ data: { ...recap, count: 0, best_club: null, best_month: null, busiest_weekday: null, sessions_count: 0, personal_records_count: 0, longest_on_pace_weeks: 0 } } as any);
  renderScreen(); expect(screen.getByText("Your next best month is ahead.")).toBeInTheDocument(); expect(screen.getByText("0 sessions.")).toBeInTheDocument();
});
