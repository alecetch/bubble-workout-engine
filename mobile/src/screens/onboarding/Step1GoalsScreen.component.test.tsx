import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Step1GoalsScreen } from "./Step1GoalsScreen";
import { useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import type { OnboardingDraft } from "../../state/onboarding/types";
import {
  buildOnboardingDraft,
  buildOnboardingStoreState,
  mockZustandSelector,
} from "../../__test-utils__";

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

vi.mock("../../components/onboarding/PillGrid", () => ({
  PillGrid: ({ options, selectedValues, onToggle }: any) => (
    <div>
      {options.map((option: any) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selectedValues.includes(option.value)}
          onClick={() => onToggle(option.value)}
        >
          {option.label}
        </button>
      ))}
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

const useMeMock = vi.mocked(useMe);
const useReferenceDataMock = vi.mocked(useReferenceData);
const useUpdateClientProfileMock = vi.mocked(useUpdateClientProfile);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);

const updateProfileMutateAsyncMock = vi.fn();
const setDraftMock = vi.fn();
const setFieldErrorsMock = vi.fn();
const setAttemptedMock = vi.fn();
const setIsSavingMock = vi.fn();

const buildDraft = buildOnboardingDraft;

function mockStore(draft: OnboardingDraft, overrides: Record<string, unknown> = {}) {
  const state = buildOnboardingStoreState(draft, {
    setDraft: setDraftMock,
    setFieldErrors: setFieldErrorsMock,
    setAttempted: setAttemptedMock,
    setIsSaving: setIsSavingMock,
    ...overrides,
  } as any);
  mockZustandSelector(useOnboardingStoreMock as any, state);
}

function renderScreen(params: Record<string, unknown> = {}) {
  const navigation = { replace: vi.fn(), goBack: vi.fn() };
  render(
    <Step1GoalsScreen
      navigation={navigation as any}
      route={{ params } as any}
    />,
  );
  return navigation;
}

describe("Step1GoalsScreen", () => {
  beforeEach(() => {
    updateProfileMutateAsyncMock.mockReset();
    setDraftMock.mockReset();
    setFieldErrorsMock.mockReset();
    setAttemptedMock.mockReset();
    setIsSavingMock.mockReset();

    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
    } as any);
    useReferenceDataMock.mockReturnValue({
      data: {
        injuryFlags: [
          { label: "No known issues", code: "none" },
          { label: "Shoulder issues", code: "shoulder" },
        ],
      },
      isLoading: false,
    } as any);
    updateProfileMutateAsyncMock.mockResolvedValue({});
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: updateProfileMutateAsyncMock,
      isPending: false,
    } as any);
    mockStore(buildDraft());
  });

  it("renders goals, fitness, and injury section headings", () => {
    renderScreen();

    expect(screen.getByText("Main goals")).toBeInTheDocument();
    expect(screen.getByText("Fitness level")).toBeInTheDocument();
    expect(screen.getByText("Injuries and limitations")).toBeInTheDocument();
  });

  it("renders loading state while reference data is loading", () => {
    useReferenceDataMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);

    renderScreen();

    expect(screen.getByText("Main goals")).toBeInTheDocument();
    expect(screen.getByText("Fitness level")).toBeInTheDocument();
    expect(screen.getByText("Injuries and limitations")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No known issues" })).not.toBeInTheDocument();
  });

  it("disables Next while saving", () => {
    mockStore(buildDraft(), { isSaving: true });

    renderScreen();

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("saves and navigates to Step2Equipment on success", async () => {
    mockStore(buildDraft({
      goals: ["Strength"],
      fitnessLevel: "Intermediate",
      injuryFlags: ["No known issues"],
    }));
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(updateProfileMutateAsyncMock).toHaveBeenCalledWith({
        goals: ["Strength"],
        fitnessLevel: "Intermediate",
        injuryFlags: ["No known issues"],
        onboardingStepCompleted: 1,
      });
      expect(navigation.replace).toHaveBeenCalledWith("Step2Equipment");
    });
  });

  it("shows validation error when no goal selected", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(setFieldErrorsMock).toHaveBeenLastCalledWith(expect.objectContaining({
        goals: "Select at least one goal.",
      }));
      expect(updateProfileMutateAsyncMock).not.toHaveBeenCalled();
    });
  });

  it("returns save error without navigating", async () => {
    updateProfileMutateAsyncMock.mockRejectedValueOnce(new Error("save failed"));
    mockStore(buildDraft({
      goals: ["Strength"],
      fitnessLevel: "Intermediate",
      injuryFlags: ["No known issues"],
    }));
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(setFieldErrorsMock).toHaveBeenLastCalledWith({
        goals: "Unable to save your changes. Please try again.",
      });
      expect(navigation.replace).not.toHaveBeenCalled();
    });
  });
});
