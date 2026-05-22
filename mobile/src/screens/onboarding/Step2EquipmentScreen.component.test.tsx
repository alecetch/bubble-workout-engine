import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Step2EquipmentScreen } from "./Step2EquipmentScreen";
import { useEquipmentItems, useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { DEFAULT_ONBOARDING_DRAFT, type OnboardingDraft } from "../../state/onboarding/types";

vi.mock("../../api/hooks", () => ({
  useMe: vi.fn(),
  useReferenceData: vi.fn(),
  useEquipmentItems: vi.fn(),
  useUpdateClientProfile: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../components/interaction/haptics", () => ({
  hapticHeavy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../components/onboarding/useErrorPulse", () => ({
  useErrorPulse: () => ({ animatedStyle: {}, pulse: vi.fn() }),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("../../components/onboarding/PresetCardList", () => ({
  PresetCardList: ({
    options,
    selectedValue,
    onSelect,
  }: {
    options: Array<{ value: string; title: string }>;
    selectedValue: string | null;
    onSelect: (value: string) => void;
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selectedValue === option.value}
          onClick={() => onSelect(option.value)}
        >
          {option.title}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../components/onboarding/OnboardingScaffold", () => ({
  OnboardingScaffold: ({ children, onBack, onNext, nextLabel, nextDisabled }: any) => (
    <div>
      {children}
      <button type="button" onClick={onBack}>
        Back
      </button>
      <button type="button" disabled={nextDisabled} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  ),
}));

vi.mock("../../components/onboarding/SectionCard", () => ({
  SectionCard: ({ title, children }: any) => (
    <section>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  ),
}));

const presetFixtures = [
  { code: "commercial_gym", label: "Commercial Gym" },
  { code: "home_gym", label: "Home Gym" },
  { code: "bodyweight", label: "Bodyweight" },
];

const itemFixtures = [
  { code: "barbell", label: "Barbell", category: "Free Weights" },
  { code: "dumbbell", label: "Dumbbell", category: "Free Weights" },
  { code: "bench", label: "Bench", category: "Benches" },
  { code: "cable", label: "Cable Machine", category: "Machines" },
];

const useMeMock = vi.mocked(useMe);
const useReferenceDataMock = vi.mocked(useReferenceData);
const useEquipmentItemsMock = vi.mocked(useEquipmentItems);
const useUpdateClientProfileMock = vi.mocked(useUpdateClientProfile);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);

const updateProfileMutateAsyncMock = vi.fn();
const setDraftMock = vi.fn();
const setFieldErrorsMock = vi.fn();
const setAttemptedMock = vi.fn();
const setIsSavingMock = vi.fn();

function buildDraft(partial: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    ...DEFAULT_ONBOARDING_DRAFT,
    equipmentPresetCode: "commercial_gym",
    selectedEquipmentCodes: [],
    fitnessLevel: "Intermediate",
    onboardingStepCompleted: 1,
    ...partial,
  };
}

function mockStore(draft: OnboardingDraft, overrides: Record<string, unknown> = {}) {
  const state = {
    draft,
    attempted: { step1: false, step2: false, step2b: false, step3: false },
    fieldErrors: {},
    isSaving: false,
    setDraft: setDraftMock,
    setFieldErrors: setFieldErrorsMock,
    setAttempted: setAttemptedMock,
    setIsSaving: setIsSavingMock,
    ...overrides,
  };
  useOnboardingStoreMock.mockImplementation((selector: any) => selector(state));
  (useOnboardingStoreMock as any).getState = () => state;
}

function renderScreen() {
  const navigation = { replace: vi.fn(), navigate: vi.fn() };
  render(
    <Step2EquipmentScreen
      navigation={navigation as any}
      route={{ key: "Step2Equipment", name: "Step2Equipment" } as any}
    />,
  );
  return navigation;
}

describe("Step2EquipmentScreen", () => {
  beforeEach(() => {
    updateProfileMutateAsyncMock.mockReset();
    setDraftMock.mockReset();
    setFieldErrorsMock.mockReset();
    setAttemptedMock.mockReset();
    setIsSavingMock.mockReset();

    updateProfileMutateAsyncMock.mockResolvedValue({});
    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
    } as any);
    useReferenceDataMock.mockReturnValue({
      data: { equipmentPresets: presetFixtures },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    useEquipmentItemsMock.mockReturnValue({
      data: { items: itemFixtures },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: updateProfileMutateAsyncMock,
      isPending: false,
    } as any);
    mockStore(buildDraft());
  });

  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it("renders preset cards from reference data", () => {
    renderScreen();

    expect(screen.getByText("Commercial Gym")).toBeInTheDocument();
    expect(screen.getByText("Home Gym")).toBeInTheDocument();
    expect(screen.getByText("Bodyweight")).toBeInTheDocument();
  });

  it("selecting a preset calls setDraft with the new preset code", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Home Gym" }));

    expect(setDraftMock).toHaveBeenCalledWith({
      equipmentPresetCode: "home_gym",
      selectedEquipmentCodes: [],
    });
  });

  it("does not clear equipment when pressing the selected preset again", () => {
    mockStore(buildDraft({ equipmentPresetCode: "commercial_gym", selectedEquipmentCodes: ["barbell", "bench"] }));

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Commercial Gym" }));

    expect(setDraftMock).not.toHaveBeenCalledWith({
      equipmentPresetCode: "commercial_gym",
      selectedEquipmentCodes: [],
    });
    expect(setFieldErrorsMock).not.toHaveBeenCalledWith({
      equipmentItemCodes: "Select at least one equipment item.",
    });
  });

  it("shows item count summary after a preset is selected and items load", async () => {
    mockStore(buildDraft({ selectedEquipmentCodes: ["barbell", "dumbbell", "bench", "cable"] }));

    renderScreen();

    expect(await screen.findByText("4 items included")).toBeInTheDocument();
  });

  it("shows Customise equipment button after preset selection", async () => {
    mockStore(buildDraft({ selectedEquipmentCodes: ["barbell"] }));

    renderScreen();

    expect(await screen.findByRole("button", { name: "Customise equipment" })).toBeInTheDocument();
  });

  it("Customise equipment button navigates to Step2EquipmentDetail", async () => {
    mockStore(buildDraft({ selectedEquipmentCodes: ["barbell"] }));
    const navigation = renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: "Customise equipment" }));

    expect(navigation.navigate).toHaveBeenCalledWith("Step2EquipmentDetail");
  });

  it("does not show the summary card when no preset is selected", () => {
    mockStore(buildDraft({ equipmentPresetCode: null, selectedEquipmentCodes: [] }));

    renderScreen();

    expect(screen.queryByText(/items included/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Customise equipment" })).not.toBeInTheDocument();
  });

  it("Next calls mutation with correct payload and navigates to Step2bBaselineLoads for non-beginners", async () => {
    mockStore(buildDraft({ selectedEquipmentCodes: ["barbell", "bench"], fitnessLevel: "Intermediate" }));
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(updateProfileMutateAsyncMock).toHaveBeenCalledWith({
        equipmentPreset: "commercial_gym",
        equipmentItemCodes: ["barbell", "bench"],
        onboardingStepCompleted: 2,
      });
      expect(navigation.replace).toHaveBeenCalledWith("Step2bBaselineLoads");
    });
  });

  it("Next button is disabled while the onboarding store is saving", () => {
    mockStore(buildDraft(), { isSaving: true });

    renderScreen();

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows save error and does not navigate on mutation failure", async () => {
    updateProfileMutateAsyncMock.mockRejectedValueOnce(new Error("save failed"));
    mockStore(buildDraft({ selectedEquipmentCodes: ["barbell", "bench"] }));
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to save this step. Please try again.")).toBeInTheDocument();
      expect(navigation.replace).not.toHaveBeenCalled();
    });
  });
});
