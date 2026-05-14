import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramReviewScreen } from "./ProgramReviewScreen";
import { useActivePrograms, useClientProfile, useEntitlement, useEquipmentItems, useMe, useReferenceData } from "../../api/hooks";
import { extractProgramId, generateProgram } from "../../api/program";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { buildClientProfile, mockZustandSelector } from "../../__test-utils__";

vi.mock("../../api/hooks", () => ({
  useActivePrograms: vi.fn(),
  useClientProfile: vi.fn(),
  useEntitlement: vi.fn(),
  useEquipmentItems: vi.fn(),
  useMe: vi.fn(),
  useReferenceData: vi.fn(),
}));

vi.mock("../../api/program", () => ({
  extractProgramId: vi.fn((response: { program_id?: string; programId?: string }) =>
    response.program_id ?? response.programId ?? null,
  ),
  generateProgram: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const useMeMock = vi.mocked(useMe);
const useClientProfileMock = vi.mocked(useClientProfile);
const useActiveProgramsMock = vi.mocked(useActivePrograms);
const useEntitlementMock = vi.mocked(useEntitlement);
const useEquipmentItemsMock = vi.mocked(useEquipmentItems);
const useReferenceDataMock = vi.mocked(useReferenceData);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);
const useSessionStoreMock = vi.mocked(useSessionStore);
const generateProgramMock = vi.mocked(generateProgram);
const extractProgramIdMock = vi.mocked(extractProgramId);

const resetFromProfileMock = vi.fn();
const setIdentityMock = vi.fn();
const setActiveProgramIdMock = vi.fn();

const mockProfile = buildClientProfile({
  id: "profile-1",
  goals: ["Strength"],
  goalNotes: "Build muscle",
  fitnessLevel: "Intermediate",
  injuryFlags: [],
  equipmentPreset: "commercial_gym",
  equipmentItemCodes: ["barbell", "dumbbell"],
  preferredDays: ["Mon", "Wed"],
  minutesPerSession: 45 as any,
  heightCm: 180,
  weightKg: 82,
  sex: "Male",
  ageRange: "25-34",
  scheduleConstraints: "No Sundays",
});

function renderScreen(params: Record<string, unknown> = {}) {
  const navigation = {
    navigate: vi.fn(),
    replace: vi.fn(),
    goBack: vi.fn(),
    getParent: vi.fn(() => null),
  };
  render(
    <ProgramReviewScreen
      route={{ params } as any}
      navigation={navigation as any}
    />,
  );
  return navigation;
}

describe("ProgramReviewScreen", () => {
  beforeEach(() => {
    resetFromProfileMock.mockReset();
    setIdentityMock.mockReset();
    setActiveProgramIdMock.mockReset();
    generateProgramMock.mockReset();
    extractProgramIdMock.mockClear();

    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    useClientProfileMock.mockReturnValue({
      data: mockProfile,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    useActiveProgramsMock.mockReturnValue({
      data: { programs: [] },
      isLoading: false,
    } as any);
    useReferenceDataMock.mockReturnValue({
      data: {
        equipmentPresets: [{ code: "commercial_gym", label: "Commercial Gym" }],
      },
      isLoading: false,
      isError: false,
    } as any);
    useEquipmentItemsMock.mockReturnValue({
      data: {
        items: [
          { code: "barbell", label: "Barbell" },
          { code: "dumbbell", label: "Dumbbell" },
        ],
      },
      isLoading: false,
      isError: false,
    } as any);
    useEntitlementMock.mockReturnValue({
      data: { is_active: true },
      isSuccess: true,
    } as any);
    mockZustandSelector(useOnboardingStoreMock as any, {
      resetFromProfile: resetFromProfileMock,
      setIdentity: setIdentityMock,
    });
    mockZustandSelector(useSessionStoreMock as any, {
      setActiveProgramId: setActiveProgramIdMock,
    });
    generateProgramMock.mockResolvedValue({ program_id: "prog-1" });
  });
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("renders a loading state while profile summary is loading", () => {
    useMeMock.mockReturnValueOnce({ isLoading: true, data: undefined } as any);
    renderScreen();
    expect(screen.getByText("Loading your profile summary...")).toBeInTheDocument();
  });

  it("renders profile load error with retry", () => {
    const refetch = vi.fn();
    useMeMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "fail" },
      refetch,
    } as any);
    useClientProfileMock.mockReturnValueOnce({ data: undefined, refetch: vi.fn() } as any);
    renderScreen();
    expect(screen.getByText("Couldn't load profile")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders user-friendly equipment labels instead of raw codes", () => {
    renderScreen();

    expect(screen.getByText("Commercial Gym")).toBeInTheDocument();
    expect(screen.getByText("Barbell, Dumbbell")).toBeInTheDocument();
    expect(screen.queryByText("commercial_gym")).not.toBeInTheDocument();
    expect(screen.queryByText("barbell, dumbbell")).not.toBeInTheDocument();
  });

  it("generates a program when the generate CTA is pressed without an active program", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Generate Program" }));
    await waitFor(() =>
      expect(generateProgramMock).toHaveBeenCalledWith({
        userId: "user-1",
        clientProfileId: "profile-1",
        programType: "default",
        anchor_date_ms: expect.any(Number),
      }),
    );
  });

  it("does not regenerate when an active program exists and the primary CTA is pressed", () => {
    useActiveProgramsMock.mockReturnValueOnce({
      data: { programs: [{ id: "prog-1" }] },
      isLoading: false,
    } as any);
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "View Today's Workout" }));
    expect(generateProgramMock).not.toHaveBeenCalled();
  });

  it("navigates to the generated program dashboard on success", async () => {
    const navigation = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Generate Program" }));
    await waitFor(() => {
      expect(setActiveProgramIdMock).toHaveBeenCalledWith("prog-1");
      expect(navigation.navigate).toHaveBeenCalledWith("ProgramDashboard", { programId: "prog-1" });
    });
  });

  it("preserveDraft skips resetFromProfile", () => {
    renderScreen({ preserveDraft: true });
    expect(resetFromProfileMock).not.toHaveBeenCalled();
  });

  it("sends inactive users to the paywall instead of generating", () => {
    useEntitlementMock.mockReturnValueOnce({
      data: { is_active: false },
      isSuccess: true,
    } as any);
    const navigation = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Generate Program" }));
    expect(navigation.navigate).toHaveBeenCalledWith("Paywall");
    expect(generateProgramMock).not.toHaveBeenCalled();
  });

  it("shows generation errors without navigating", async () => {
    generateProgramMock.mockRejectedValueOnce(new Error("generation exploded"));
    const navigation = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Generate Program" }));
    expect(await screen.findByText("Generation failed")).toBeInTheDocument();
    expect(screen.getByText("generation exploded")).toBeInTheDocument();
    expect(navigation.navigate).not.toHaveBeenCalledWith("ProgramDashboard", expect.anything());
  });
});
