import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentAsync } from "expo-document-picker";
import { useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import { uploadTrainingHistoryCsv } from "../../api/trainingHistoryImport";
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
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("expo-document-picker", () => ({
  getDocumentAsync: vi.fn(),
}));

vi.mock("../../api/trainingHistoryImport", () => ({
  uploadTrainingHistoryCsv: vi.fn(),
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
const getDocumentAsyncMock = vi.mocked(getDocumentAsync);
const uploadTrainingHistoryCsvMock = vi.mocked(uploadTrainingHistoryCsv);

function mockStore(overrides: Record<string, unknown> = {}) {
  const state = buildOnboardingStoreState({ selectedEquipmentCodes: [] }, {
    setDraft: setDraftMock,
    setAttempted: setAttemptedMock,
    setIsSaving: setIsSavingMock,
    ...overrides,
  } as any);
  mockZustandSelector(useOnboardingStoreMock as any, state);
}

function makeNav() {
  return { navigate: vi.fn(), goBack: vi.fn(), replace: vi.fn() };
}

function renderScreen(nav = makeNav()) {
  render(<Step2bBaselineLoadsScreen navigation={nav as any} route={{} as any} />);
  return nav;
}

describe("Step2bBaselineLoadsScreen", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue({});
    setAttemptedMock.mockReset();
    setDraftMock.mockReset();
    setIsSavingMock.mockReset();
    getDocumentAsyncMock.mockReset();
    uploadTrainingHistoryCsvMock.mockReset();

    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
    } as any);
    useReferenceDataMock.mockReturnValue({
      data: { anchorExercises: ANCHOR_EXERCISES },
      isLoading: false,
    } as any);
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    } as any);
    mockStore();
  });

  it("renders known_weights mode by default with all family section titles", () => {
    renderScreen();

    expect(screen.getByText("Choose a setup method")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Known weights" })).toBeInTheDocument();
    for (const label of FAMILY_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders loading indicator while reference data is loading", () => {
    useReferenceDataMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);

    renderScreen();

    expect(screen.getByText("Choose a setup method")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.queryByText("No anchor lifts available")).not.toBeInTheDocument();
  });

  it("mode chips switch views", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Test mode" }));
    expect(screen.getByText(/Lift 1 of 6/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import history" }));
    expect(screen.getByRole("button", { name: "Select CSV file" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Known weights" }));
    expect(screen.getByText("Squat")).toBeInTheDocument();
  });

  it("in known_weights mode, step-level skip toggle saves with empty anchors", async () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        anchorLifts: [],
        anchorLiftsSkipped: true,
      });
      expect(navigation.replace).toHaveBeenCalledWith("Step3Schedule");
    });
  });

  it("in known_weights mode, Continue saves all-skipped payload and navigates", async () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        anchorLifts: [],
        anchorLiftsSkipped: true,
      });
      expect(navigation.replace).toHaveBeenCalledWith("Step3Schedule");
    });
  });

  it("in known_weights mode, shows error text and does not navigate when save rejects", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("network"));
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to save this step. Please try again.")).toBeInTheDocument();
      expect(navigation.replace).not.toHaveBeenCalled();
    });
  });

  it("in fitness_test mode, renders one family section title with counter", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Test mode" }));

    expect(screen.getByText(/Lift 1 of 6/)).toBeInTheDocument();
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.queryByText("Hinge (Deadlift / RDL)")).not.toBeInTheDocument();
  });

  it('in fitness_test mode, "Skip this lift" button advances the counter', () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Test mode" }));
    expect(screen.getByText(/Lift 1 of 6/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip this lift" }));
    expect(screen.getByText(/Lift 2 of 6/)).toBeInTheDocument();
  });

  it('in fitness_test mode, "Skip this lift" on the last family saves and navigates', async () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Test mode" }));
    for (let index = 0; index < 6; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Skip this lift" }));
    }

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalled();
      expect(navigation.replace).toHaveBeenCalledWith("Step3Schedule");
    });
  });

  it("in import_history mode, shows import summary after successful CSV upload", async () => {
    getDocumentAsyncMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/data.csv", name: "data.csv", mimeType: "text/csv" }],
    } as any);
    uploadTrainingHistoryCsvMock.mockResolvedValue({
      importId: "imp-1",
      status: "complete",
      derivedAnchorLifts: [],
      warnings: [],
      summary: {
        totalRows: 120,
        mappedRows: 110,
        unmappedRows: 10,
        derivedAnchors: 4,
        savedAnchors: 4,
      },
    });

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Import history" }));
    fireEvent.click(screen.getByRole("button", { name: "Select CSV file" }));

    await waitFor(() => {
      expect(screen.getByText("Rows processed: 120")).toBeInTheDocument();
      expect(screen.getByText("Derived anchors: 4")).toBeInTheDocument();
    });
  });

  it("Back button navigates to Step2Equipment", () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(navigation.replace).toHaveBeenCalledWith("Step2Equipment");
  });
});
