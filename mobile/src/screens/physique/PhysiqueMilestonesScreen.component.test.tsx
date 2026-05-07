import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useNavigation } from "@react-navigation/native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePhysiqueMilestones } from "../../api/hooks";
import { PhysiqueMilestonesScreen } from "./PhysiqueMilestonesScreen";

vi.mock("../../api/hooks", () => ({
  usePhysiqueMilestones: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("@react-navigation/native", () => {
  return {
    useNavigation: vi.fn(),
  };
});

const parentNavigateMock = vi.fn();
const navMock = {
  navigate: vi.fn(),
  goBack: vi.fn(),
  getParent: vi.fn(() => ({ navigate: parentNavigateMock })),
};
const useNavigationMock = vi.mocked(useNavigation);
const usePhysiqueMilestonesMock = vi.mocked(usePhysiqueMilestones);

describe("PhysiqueMilestonesScreen", () => {
  beforeEach(() => {
    parentNavigateMock.mockReset();
    navMock.navigate.mockReset();
    navMock.goBack.mockReset();
    navMock.getParent.mockReset().mockReturnValue({ navigate: parentNavigateMock });
    useNavigationMock.mockReturnValue(navMock as any);
    usePhysiqueMilestonesMock.mockReturnValue({
      data: { milestones: [] },
      isLoading: false,
      error: null,
    } as any);
  });

  it("shows loading indicator when isLoading is true", () => {
    usePhysiqueMilestonesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    render(<PhysiqueMilestonesScreen />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("Physique Milestones")).not.toBeInTheDocument();
  });

  it("calls parent navigator to Paywall when error code is premium_required", () => {
    usePhysiqueMilestonesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { code: "premium_required" },
    } as any);

    render(<PhysiqueMilestonesScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Premium" }));

    expect(parentNavigateMock).toHaveBeenCalledWith("HomeTab", { screen: "Paywall" });
  });

  it("renders milestone titles for achieved and locked entries", () => {
    usePhysiqueMilestonesMock.mockReturnValue({
      data: {
        milestones: [
          {
            milestone_slug: "first_scan",
            achieved_at: "2026-03-01T00:00:00Z",
            scan_id: "s1",
          },
        ],
      },
      isLoading: false,
      error: null,
    } as any);

    render(<PhysiqueMilestonesScreen />);

    expect(screen.getByText("First scan complete")).toBeInTheDocument();
    expect(screen.getByText("3-week streak")).toBeInTheDocument();
    expect(screen.getByText(/Unlocked/)).toBeInTheDocument();
    expect(screen.getByText("Submit 3 weekly scans in a row")).toBeInTheDocument();
  });

  it("Back button calls navigation.goBack", () => {
    render(<PhysiqueMilestonesScreen />);

    fireEvent.click(screen.getByText(/Back/));

    expect(navMock.goBack).toHaveBeenCalledTimes(1);
  });
});
