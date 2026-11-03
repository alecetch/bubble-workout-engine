import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Haptics from "expo-haptics";
import { withSequence } from "react-native-reanimated";
import { MilestoneCelebration } from "./MilestoneCelebration";
import { shouldReduceMotion } from "../../utils/reduceMotion";
import type { MilestoneMoment } from "../../api/yearProgress";

const sharing = vi.hoisted(() => ({ shareCard: vi.fn().mockResolvedValue(undefined), isSharing: false }));
vi.mock("../share/useShareCard", () => ({ useShareCard: () => ({ ...sharing, shareView: null }) }));
vi.mock("../../utils/reduceMotion", () => ({ shouldReduceMotion: vi.fn().mockResolvedValue(false) }));
const moment = (slug: string, threshold: number, target = 200): MilestoneMoment => ({ id: slug, slug, threshold, target, year: 2026 });
describe("MilestoneCelebration", () => {
  beforeEach(() => { sharing.shareCard.mockClear(); sharing.isSharing = false; vi.mocked(withSequence).mockClear(); vi.mocked(Haptics.notificationAsync).mockClear(); vi.mocked(shouldReduceMotion).mockResolvedValue(false); });
  it.each([
    ["day_1", 1, "Day 1. The year starts here."],
    ["day_25", 25, "Day 25. 175 to go for 200."],
    ["day_50", 50, "Day 50. 150 to go for 200."],
    ["day_100", 100, "Day 100. Half way to 200."],
    ["day_150", 150, "Day 150. 50 to go for 200."],
    ["club_100", 100, "Club 100. The habit is real."],
  ])("renders the %s card", async (slug, threshold, copy) => {
    render(<MilestoneCelebration milestone={moment(slug as string, threshold as number)} onDismiss={vi.fn()} />);
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByTestId("milestone-card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    await act(async () => {});
  });
  it.each([
    ["club_200", 200, "200. You're in for 2026."],
    ["club_250", 250, "Club 250. Elite consistency."],
    ["club_300", 300, "Club 300. Almost every day of the year."],
  ])("renders the %s full-screen moment", async (slug, threshold, copy) => {
    const dismiss = vi.fn();
    render(<MilestoneCelebration milestone={moment(slug as string, threshold as number)} onDismiss={dismiss} />);
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByTestId("milestone-full-screen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: slug === "club_200" ? "Go for Club 250" : "Let's go" }));
    expect(dismiss).toHaveBeenCalledOnce();
    await act(async () => {});
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });
  it("uses the actual pro-rated target and never says half way for another target", async () => {
    const view = render(<MilestoneCelebration milestone={moment("club_200", 50, 50)} onDismiss={vi.fn()} />);
    expect(screen.getByText("50. You're in for 2026.")).toBeInTheDocument();
    view.rerender(<MilestoneCelebration milestone={moment("day_100", 100, 50)} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/Half way/)).not.toBeInTheDocument();
    await act(async () => {});
  });
  it("disables sharing while acknowledging and handles acknowledgement errors", async () => {
    const onShare = vi.fn();
    render(<MilestoneCelebration milestone={moment("club_200", 200)} onDismiss={vi.fn()} showShare onShare={onShare}
      error="Couldn't save this celebration. Try again." isDismissing />);
    expect(screen.getByRole("button", { name: "Go for Club 250" })).toBeDisabled();
    expect(screen.getByText("Couldn't save this celebration. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    await act(async () => {});
  });
  it("respects reduced motion and does not repeat haptics on rerender", async () => {
    vi.mocked(shouldReduceMotion).mockResolvedValue(true);
    const row = moment("club_200", 200);
    const view = render(<MilestoneCelebration milestone={row} onDismiss={vi.fn()} />);
    await act(async () => {});
    expect(withSequence).not.toHaveBeenCalled();
    view.rerender(<MilestoneCelebration milestone={row} onDismiss={vi.fn()} />);
    expect(Haptics.notificationAsync).toHaveBeenCalledOnce();
  });
  it("renders nothing without a milestone", () => {
    const { container } = render(<MilestoneCelebration milestone={null} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it.each([
    ["day_100", 100, { type: "milestone", count: 100, year: 2026, isTarget: false }],
    ["club_200", 50, { type: "milestone", count: 50, year: 2026, isTarget: true }],
    ["club_250", 250, { type: "club", tier: 250, count: 263, year: 2026 }],
  ])("shares the matching %s card", async (slug, threshold, expected) => {
    render(<MilestoneCelebration milestone={{ ...moment(slug as string, threshold as number), count: 263 }} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(sharing.shareCard).toHaveBeenCalledWith(expected);
    await act(async () => {});
  });
  it("can hide sharing explicitly", () => {
    render(<MilestoneCelebration milestone={moment("day_1", 1)} onDismiss={vi.fn()} showShare={false} />);
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });
  it("keeps dismissal disabled until sharing finishes", () => {
    sharing.isSharing = true;
    render(<MilestoneCelebration milestone={moment("day_1", 1)} onDismiss={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sharing..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Let's go" })).toBeDisabled();
  });

});
