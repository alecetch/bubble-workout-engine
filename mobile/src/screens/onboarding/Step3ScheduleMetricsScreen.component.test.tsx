import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Step3ScheduleMetricsScreen } from "./Step3ScheduleMetricsScreen";
import { useMe, useUpdateClientProfile } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import type { OnboardingDraft } from "../../state/onboarding/types";
import {
  buildOnboardingDraft,
  buildOnboardingStoreState,
  mockZustandSelector,
} from "../../__test-utils__";

vi.mock("../../api/hooks", () => ({
  useMe: vi.fn(),
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

vi.mock("../../components/onboarding/DayChipRow", () => ({ DayChipRow: () => null }));
vi.mock("../../components/onboarding/SelectField", () => ({ SelectField: () => null }));
vi.mock("../../components/onboarding/NumericField", () => ({ NumericField: () => null }));
vi.mock("../../components/onboarding/MultilineField", () => ({ MultilineField: () => null }));
vi.mock("../../components/onboarding/SectionCard", () => ({
  SectionCard: ({ title, children }: any) => (
    <section>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  ),
}));

const useMeMock = vi.mocked(useMe);
const useUpdateClientProfileMock = vi.mocked(useUpdateClientProfile);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);

const updateProfileMutateAsyncMock = vi.fn();
const setDraftMock = vi.fn();
const setFieldErrorsMock = vi.fn();
const setAttemptedMock = vi.fn();
const setIsSavingMock = vi.fn();

const buildDraft = buildOnboardingDraft;

const validDraft = buildDraft({
  preferredDays: ["Mon", "Wed"],
  minutesPerSession: 50,
  sex: "Male",
  ageRange: "25-34",
  heightCm: 180,
  weightKg: 82,
  scheduleConstraints: "No Sundays",
});

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

function renderScreen() {
  const navigation = { replace: vi.fn(), navigate: vi.fn() };
  render(<Step3ScheduleMetricsScreen navigation={navigation as any} route={{} as any} />);
  return navigation;
}

describe("Step3ScheduleMetricsScreen", () => {
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
    updateProfileMutateAsyncMock.mockResolvedValue({});
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: updateProfileMutateAsyncMock,
      isPending: false,
    } as any);
    mockStore(validDraft);
  });

  it("renders schedule and metrics section headings", () => {
    renderScreen();

    expect(screen.getByText("Preferred training days")).toBeInTheDocument();
    expect(screen.getByText("Session settings")).toBeInTheDocument();
    expect(screen.getByText("Body metrics")).toBeInTheDocument();
    expect(screen.getByText("Schedule constraints")).toBeInTheDocument();
  });

  it("disables Finish while saving", () => {
    mockStore(validDraft, { isSaving: true });

    renderScreen();

    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
  });

  it("blocks submission when age range is Under 18", () => {
    mockStore(buildDraft({ ...validDraft, ageRange: "Under 18" }));

    renderScreen();

    expect(screen.getByText("You must be 18 or older to continue.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
    expect(updateProfileMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("saves and navigates to ProgramReview on success", async () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    await waitFor(() => {
      expect(updateProfileMutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
        preferredDays: ["Mon", "Wed"],
        minutesPerSession: 50,
        heightCm: 180,
        weightKg: 82,
        sex: "Male",
        ageRange: "25-34",
        scheduleConstraints: "No Sundays",
        onboardingStepCompleted: 3,
        onboardingCompletedAt: expect.any(String),
      }));
      expect(navigation.navigate).toHaveBeenCalledWith("ProgramReview");
    });
  });

  it("shows save error without navigating", async () => {
    updateProfileMutateAsyncMock.mockRejectedValueOnce(new Error("save failed"));
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    await waitFor(() => {
      expect(setFieldErrorsMock).toHaveBeenLastCalledWith({
        preferredDays: "Unable to save this step. Please try again.",
      });
      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });
});
