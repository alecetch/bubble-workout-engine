import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SplitReviewScreen } from "./SplitReviewScreen";

const {
  patchProgramSplitMock,
  updateProfileMutateAsyncMock,
  useClientProfileMock,
  useMeMock,
  useSplitRecommendationMock,
  useUpdateClientProfileMock,
} = vi.hoisted(() => ({
  patchProgramSplitMock: vi.fn(),
  updateProfileMutateAsyncMock: vi.fn(),
  useClientProfileMock: vi.fn(),
  useMeMock: vi.fn(),
  useSplitRecommendationMock: vi.fn(),
  useUpdateClientProfileMock: vi.fn(),
}));

vi.mock("../../api/hooks", () => ({
  patchProgramSplit: patchProgramSplitMock,
  useClientProfile: useClientProfileMock,
  useMe: useMeMock,
  useSplitRecommendation: useSplitRecommendationMock,
  useUpdateClientProfile: useUpdateClientProfileMock,
}));

vi.mock("../../components/onboarding/OnboardingScaffold", () => ({
  OnboardingScaffold: ({
    children,
    onBack,
    onNext,
    nextLabel,
    nextDisabled,
    nextTestID,
  }: {
    children: React.ReactNode;
    onBack: () => void;
    onNext: () => void;
    nextLabel: string;
    nextDisabled: boolean;
    nextTestID?: string;
  }) => (
    <div>
      {children}
      <button type="button" onClick={onBack}>
        Back
      </button>
      <button type="button" data-testid={nextTestID} disabled={nextDisabled} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  ),
}));

vi.mock("../../components/onboarding/SectionCard", () => ({
  SectionCard: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <section>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  ),
}));

vi.mock("../../components/onboarding/FocusPickerSheet", () => ({
  FocusPickerSheet: ({
    visible,
    onSelect,
    onClose,
  }: {
    visible: boolean;
    onSelect: (focus: string) => void;
    onClose: () => void;
  }) =>
    visible ? (
      <div>
        <button type="button" onClick={() => onSelect("legs")}>
          Legs
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, onPress, testID }: { children: React.ReactNode; onPress?: () => void; testID?: string }) => (
    <button type="button" data-testid={testID} onClick={onPress}>
      {children}
    </button>
  ),
}));

function renderScreen(routeParams?: Record<string, unknown>) {
  const navigation = {
    goBack: vi.fn(),
    navigate: vi.fn(),
    popToTop: vi.fn(),
  };
  render(
    <SplitReviewScreen
      navigation={navigation as never}
      route={{ params: routeParams ?? {} } as never}
    />,
  );
  return navigation;
}

describe("SplitReviewScreen", () => {
  beforeEach(() => {
    patchProgramSplitMock.mockReset();
    patchProgramSplitMock.mockResolvedValue({ ok: true, updatedCount: 4 });
    updateProfileMutateAsyncMock.mockReset();
    updateProfileMutateAsyncMock.mockResolvedValue({});
    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
    });
    useClientProfileMock.mockReturnValue({
      data: { preferredDays: ["Mon", "Tue", "Thu", "Sat"] },
      isLoading: false,
    });
    useSplitRecommendationMock.mockReturnValue({
      data: {
        programType: "hypertrophy",
        daysPerWeek: 4,
        recommendation: ["upper_body", "lower_body", "upper_body", "lower_body"],
        existingPreference: null,
        existingModifiedByUser: false,
      },
      isLoading: false,
      isError: false,
    });
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: updateProfileMutateAsyncMock,
      isPending: false,
    });
  });

  it("renders one chip per recommended training day", () => {
    renderScreen();

    expect(screen.getByText("Weekly focus")).toBeInTheDocument();
    expect(screen.getByText("MON")).toBeInTheDocument();
    expect(screen.getAllByText("Upper")).toHaveLength(2);
    expect(screen.getAllByText("Lower")).toHaveLength(2);
  });

  it("saves a custom split and navigates to ProgramReview", async () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByTestId("split-day-chip-1"));
    fireEvent.click(screen.getByRole("button", { name: "Legs" }));
    fireEvent.click(screen.getByTestId("split-continue-button"));

    await waitFor(() => {
      expect(updateProfileMutateAsyncMock).toHaveBeenCalledWith({
        preferredSplitJson: {
          day_focuses: ["upper_body", "legs", "upper_body", "lower_body"],
          modified_by_user: true,
        },
      });
      expect(navigation.navigate).toHaveBeenCalledWith("ProgramReview");
    });
  });

  it("resets to the recommendation after an edit", () => {
    renderScreen();

    fireEvent.click(screen.getByTestId("split-day-chip-1"));
    fireEvent.click(screen.getByRole("button", { name: "Legs" }));
    expect(screen.getByText("Reset to recommended")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reset to recommended"));
    expect(screen.queryByText("Reset to recommended")).not.toBeInTheDocument();
  });

  it("patches remaining program days on the recalibrate path", async () => {
    const navigation = renderScreen({ fromRecalibrate: true, programId: "program-1" });

    fireEvent.click(screen.getByTestId("split-continue-button"));

    await waitFor(() => {
      expect(patchProgramSplitMock).toHaveBeenCalledWith("program-1", [
        "upper_body",
        "lower_body",
        "upper_body",
        "lower_body",
      ]);
      expect(navigation.popToTop).toHaveBeenCalled();
    });
  });
});
