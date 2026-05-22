import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { Step2bBaselineLoadsScreen } from "./Step2bBaselineLoadsScreen";
import { buildOnboardingStoreState, mockZustandSelector } from "../../__test-utils__";

vi.mock("../../api/hooks", () => ({
  useMe: vi.fn(),
  useReferenceData: vi.fn(),
  useUpdateClientProfile: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../components/interaction/haptics", () => ({
  hapticHeavy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Heavy: "heavy" },
}));

vi.mock("../../components/onboarding/OnboardingScaffold", () => ({
  OnboardingScaffold: ({ children, onBack, onNext, nextLabel, nextDisabled }: any) => (
    <div>
      <button type="button" onClick={onBack}>
        Back
      </button>
      {children}
      <button type="button" disabled={nextDisabled} onClick={onNext}>
        {nextLabel ?? "Continue"}
      </button>
    </div>
  ),
}));

vi.mock("../../components/onboarding/SectionCard", () => ({
  SectionCard: ({ title, subtitle, children }: any) => (
    <section>
      {title ? <h2>{title}</h2> : null}
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </section>
  ),
}));

vi.mock("../../components/onboarding/SelectField", () => ({
  SelectField: () => null,
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const ANCHOR_EXERCISES = [
  {
    exerciseId: "ex-sq",
    estimationFamily: "squat",
    isAnchorEligible: true,
    anchorPriority: 1,
    label: "Back Squat",
    equipmentItemsSlugs: [],
  },
  {
    exerciseId: "ex-hi",
    estimationFamily: "hinge",
    isAnchorEligible: true,
    anchorPriority: 1,
    label: "Deadlift",
    equipmentItemsSlugs: [],
  },
  {
    exerciseId: "ex-hp",
    estimationFamily: "horizontal_press",
    isAnchorEligible: true,
    anchorPriority: 1,
    label: "Bench Press",
    equipmentItemsSlugs: [],
  },
  {
    exerciseId: "ex-vp",
    estimationFamily: "vertical_press",
    isAnchorEligible: true,
    anchorPriority: 1,
    label: "OHP",
    equipmentItemsSlugs: [],
  },
  {
    exerciseId: "ex-hpu",
    estimationFamily: "horizontal_pull",
    isAnchorEligible: true,
    anchorPriority: 1,
    label: "Barbell Row",
    equipmentItemsSlugs: [],
  },
  {
    exerciseId: "ex-vpu",
    estimationFamily: "vertical_pull",
    isAnchorEligible: true,
    anchorPriority: 1,
    label: "Pull-up",
    equipmentItemsSlugs: [],
  },
];

const FAMILY_LABELS = [
  "Squat",
  "Hinge (Deadlift / RDL)",
  "Horizontal Press (Bench / Push)",
  "Vertical Press (Overhead)",
  "Horizontal Pull (Row)",
  "Vertical Pull (Pulldown / Pull-up)",
];

const mutateAsyncMock = vi.fn();
const setAttemptedMock = vi.fn();
const setDraftMock = vi.fn();
const setIsSavingMock = vi.fn();
const useMeMock = vi.mocked(useMe);
const useReferenceDataMock = vi.mocked(useReferenceData);
const useUpdateClientProfileMock = vi.mocked(useUpdateClientProfile);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);

function mockStore(overrides: Record<string, unknown> = {}) {
  const state = buildOnboardingStoreState(
    { selectedEquipmentCodes: [], fitnessLevel: "Intermediate", preferredUnit: "kg" } as any,
    {
      setDraft: setDraftMock,
      setAttempted: setAttemptedMock,
      setIsSaving: setIsSavingMock,
      ...overrides,
    } as any,
  );
  mockZustandSelector(useOnboardingStoreMock as any, state);
}

function makeNav() {
  return { navigate: vi.fn(), goBack: vi.fn(), replace: vi.fn() };
}

function renderScreen(nav = makeNav()) {
  render(<Step2bBaselineLoadsScreen navigation={nav as any} route={{} as any} />);
  return nav;
}

function changeSquatWeight(value: string): void {
  fireEvent.change(screen.getByTestId("weight-input-squat"), { target: { value } });
}

describe("Step2bBaselineLoadsScreen", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue({});
    setAttemptedMock.mockReset();
    setDraftMock.mockReset();
    setIsSavingMock.mockReset();

    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
    } as any);
    useReferenceDataMock.mockReturnValue({
      data: { anchorExercises: ANCHOR_EXERCISES },
      isLoading: false,
      isError: false,
    } as any);
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    } as any);
    mockStore();
  });

  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it("renders all family labels, default reps, and an enabled Continue button", () => {
    renderScreen();

    for (const label of FAMILY_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("3")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("auto-skips on mount when no eligible exercises are available", async () => {
    useReferenceDataMock.mockReturnValueOnce({
      data: { anchorExercises: [] },
      isLoading: false,
      isError: false,
    } as any);
    const navigation = renderScreen();

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        anchorLifts: [],
        anchorLiftsSkipped: true,
        preferredUnit: "kg",
      });
      expect(navigation.replace).toHaveBeenCalledWith("Step3Schedule");
    });
  });

  it("skip link saves skipped anchors and navigates", async () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByText("Skip this step ->"));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        anchorLifts: [],
        anchorLiftsSkipped: true,
        preferredUnit: "kg",
      });
      expect(navigation.replace).toHaveBeenCalledWith("Step3Schedule");
    });
  });

  it("reps stepper increments, decrements, and disables minus at 1", () => {
    renderScreen();
    const increment = screen.getAllByRole("button", { name: "Increase reps" })[0];
    const decrement = screen.getAllByRole("button", { name: "Decrease reps" })[0];

    fireEvent.click(increment);
    expect(screen.getByText("4")).toBeInTheDocument();

    fireEvent.click(decrement);
    fireEvent.click(decrement);
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(decrement);
    expect(decrement).toBeDisabled();
  });

  it("unit toggle converts kg placeholder to lbs", () => {
    renderScreen();

    expect(screen.getByPlaceholderText("e.g. 80")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use lbs" }));

    expect(screen.getAllByText("lbs").length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("e.g. 176")).toBeInTheDocument();
  });

  it("saves a kg load for the squat row", async () => {
    const navigation = renderScreen();

    changeSquatWeight("100");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        anchorLifts: expect.arrayContaining([
          expect.objectContaining({
            estimationFamily: "squat",
            exerciseId: "ex-sq",
            loadKg: 100,
            reps: 3,
            skipped: false,
          }),
        ]),
        anchorLiftsSkipped: false,
        preferredUnit: "kg",
      });
      expect(navigation.replace).toHaveBeenCalledWith("Step3Schedule");
    });
  });

  it("saves a lbs load converted to kg for the squat row", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Use lbs" }));
    changeSquatWeight("220");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        anchorLifts: expect.arrayContaining([
          expect.objectContaining({
            estimationFamily: "squat",
            loadKg: 99.8,
            skipped: false,
          }),
        ]),
        anchorLiftsSkipped: false,
        preferredUnit: "lbs",
      });
    });
  });

  it("empty rows are saved as skipped", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        anchorLifts: [],
        anchorLiftsSkipped: true,
        preferredUnit: "kg",
      });
    });
  });

  it("includes preferredUnit in the payload", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Use lbs" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ preferredUnit: "lbs" }));
    });
  });

  it("shows an error and does not navigate when save rejects", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("network"));
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to save this step. Please try again.")).toBeInTheDocument();
      expect(navigation.replace).not.toHaveBeenCalled();
    });
  });

  it("Back button navigates to Step2Equipment", () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(navigation.replace).toHaveBeenCalledWith("Step2Equipment");
  });

  it("disables Continue while reference data is loading", () => {
    useReferenceDataMock.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);

    renderScreen();

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});
