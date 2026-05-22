import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Step2EquipmentDetailScreen } from "./Step2EquipmentDetailScreen";
import { useEquipmentItems, useReferenceData } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { DEFAULT_ONBOARDING_DRAFT, type OnboardingDraft } from "../../state/onboarding/types";

vi.mock("../../api/hooks", () => ({
  useReferenceData: vi.fn(),
  useEquipmentItems: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("../../components/onboarding/OnboardingScaffold", () => ({
  OnboardingScaffold: ({ children, onBack, onNext, nextLabel }: any) => (
    <div>
      <button type="button" onClick={onBack}>
        Back
      </button>
      {children}
      <button type="button" onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  ),
}));

vi.mock("../../components/onboarding/EquipmentCategorySection", () => ({
  EquipmentCategorySection: ({
    category,
    options,
    selectedValues,
    onToggleItem,
  }: {
    category: string;
    options: Array<{ value: string; label: string }>;
    selectedValues: string[];
    onToggleItem: (value: string) => void;
  }) => (
    <section aria-label={category}>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            checked={selectedValues.includes(option.value)}
            onChange={() => onToggleItem(option.value)}
            aria-label={option.label}
          />
          {option.label}
        </label>
      ))}
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

const useReferenceDataMock = vi.mocked(useReferenceData);
const useEquipmentItemsMock = vi.mocked(useEquipmentItems);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);

const setDraftMock = vi.fn();

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

function mockStore(draft: OnboardingDraft) {
  const state = {
    draft,
    setDraft: setDraftMock,
  };
  useOnboardingStoreMock.mockImplementation((selector: any) => selector(state));
}

function renderScreen() {
  const navigation = { goBack: vi.fn() };
  render(
    <Step2EquipmentDetailScreen
      navigation={navigation as any}
      route={{ key: "Step2EquipmentDetail", name: "Step2EquipmentDetail" } as any}
    />,
  );
  return navigation;
}

describe("Step2EquipmentDetailScreen", () => {
  beforeEach(() => {
    setDraftMock.mockReset();

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
    mockStore(buildDraft());
  });

  it("renders equipment categories for the selected preset", () => {
    mockStore(buildDraft({ selectedEquipmentCodes: ["barbell", "bench"] }));

    renderScreen();

    expect(screen.getByRole("region", { name: "Free Weights" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Benches" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Machines" })).toBeInTheDocument();
  });

  it("pre-checks items that are already in the draft", () => {
    mockStore(buildDraft({ selectedEquipmentCodes: ["barbell", "bench"] }));

    renderScreen();

    expect(screen.getByRole("checkbox", { name: "Barbell" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bench" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Dumbbell" })).not.toBeChecked();
  });

  it("search input filters equipment items", () => {
    renderScreen();

    fireEvent.change(screen.getByPlaceholderText("Search equipment"), { target: { value: "barbell" } });

    expect(screen.getByText("Barbell")).toBeInTheDocument();
    expect(screen.queryByText("Dumbbell")).not.toBeInTheDocument();
    expect(screen.queryByText("Bench")).not.toBeInTheDocument();
  });

  it("toggling an unchecked item adds it to the draft", () => {
    mockStore(buildDraft({ selectedEquipmentCodes: [] }));

    renderScreen();
    fireEvent.click(screen.getByRole("checkbox", { name: "Barbell" }));

    expect(setDraftMock).toHaveBeenCalledWith({ selectedEquipmentCodes: ["barbell"] });
  });

  it("Done button navigates back to Step2Equipment", () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(navigation.goBack).toHaveBeenCalled();
  });
});
