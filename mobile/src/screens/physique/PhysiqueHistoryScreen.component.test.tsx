import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePhysiqueScans, usePhysiqueScanTrend } from "../../api/hooks";
import { PhysiqueHistoryScreen } from "./PhysiqueHistoryScreen";

vi.mock("../../api/hooks", () => ({
  usePhysiqueScans: vi.fn(),
  usePhysiqueScanTrend: vi.fn(),
}));

vi.mock("react-native-svg", () => ({
  __esModule: true,
  default: ({ children }: any) => <svg>{children}</svg>,
  Circle: (props: any) => <circle {...props} />,
  Path: (props: any) => <path {...props} />,
  Text: ({ children }: any) => <text>{children}</text>,
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("../history/chartUtils", () => ({
  buildChartPath: vi.fn(() => ({
    svgPath: null,
    points: [],
    markers: [],
    maxVal: 0,
    minVal: 0,
    padding: { left: 0, top: 0 },
    plotH: 0,
  })),
  formatShortDate: vi.fn(() => ""),
}));

const SCANS = [
  {
    id: "scan-1",
    submitted_at: "2026-04-01T10:00:00Z",
    physique_score: 72,
    score_delta: null,
    photo_url: null,
    milestones_achieved: [],
    streak_at_submission: 1,
  },
  {
    id: "scan-2",
    submitted_at: "2026-04-15T10:00:00Z",
    physique_score: 78,
    score_delta: null,
    photo_url: null,
    milestones_achieved: [],
    streak_at_submission: 2,
  },
];

const usePhysiqueScansMock = vi.mocked(usePhysiqueScans);
const usePhysiqueScanTrendMock = vi.mocked(usePhysiqueScanTrend);

function makeNav() {
  return { navigate: vi.fn(), goBack: vi.fn(), getParent: vi.fn(() => null) };
}

function renderScreen(nav = makeNav()) {
  render(<PhysiqueHistoryScreen navigation={nav as any} route={{} as any} />);
  return nav;
}

describe("PhysiqueHistoryScreen", () => {
  beforeEach(() => {
    usePhysiqueScansMock.mockReturnValue({
      data: { scans: SCANS },
      isLoading: false,
      error: null,
    } as any);
    usePhysiqueScanTrendMock.mockReturnValue({
      data: { trend: [], region_trends: {} },
      isLoading: false,
      error: null,
    } as any);
  });

  it("shows loading indicator when usePhysiqueScans returns isLoading true", () => {
    usePhysiqueScansMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    renderScreen();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("Loading physique history...")).toBeInTheDocument();
  });

  it("shows premium gate UI when error has code premium_required", () => {
    usePhysiqueScansMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { code: "premium_required" },
    } as any);

    renderScreen();

    expect(screen.getByText("Upgrade to Premium")).toBeInTheDocument();
    expect(screen.queryByText("4W")).not.toBeInTheDocument();
  });

  it("shows empty state text when scan list is empty and mode is photos", () => {
    usePhysiqueScansMock.mockReturnValue({
      data: { scans: [] },
      isLoading: false,
      error: null,
    } as any);

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Photos" }));

    expect(screen.getByText("No premium scans yet.")).toBeInTheDocument();
  });

  it("chart mode is the default with range chips and no photo scores", () => {
    renderScreen();

    expect(screen.getByRole("button", { name: "Chart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Photos" })).toBeInTheDocument();
    expect(screen.getByText("4W")).toBeInTheDocument();
    expect(screen.queryByText("72.0")).not.toBeInTheDocument();
  });

  it("switching to Photos mode renders score overlays for each scan", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Photos" }));

    expect(screen.getByText("72.0")).toBeInTheDocument();
    expect(screen.getByText("78.0")).toBeInTheDocument();
  });
});
