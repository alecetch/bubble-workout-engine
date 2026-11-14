import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { queryKeys } from "../../api/hooks/shared";
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

vi.mock("../../api/hooks", async () => ({
  queryKeys: (await import("../../api/hooks/shared")).queryKeys,
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

const alertMock = vi.spyOn(Alert, "alert");
const invalidateQueriesMock = vi.fn();

function confirmReplace() {
  const buttons = alertMock.mock.calls.at(-1)?.[2];
  const replace = buttons?.find(button => button.text === "Replace program");
  act(() => { replace?.onPress?.(); });
}

const resetFromProfileMock = vi.fn();
const setIdentityMock = vi.fn();
const setActiveProgramIdMock = vi.fn();

const mockProfile = buildClientProfile({
  id: "profile-1",
  goals: ["Strength"],
  goalNotes: "Build muscle",
  fitnessLevel: "Intermediate",
  injuryFlags: ["wrist_elbow"],
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
    alertMock.mockReset();
    invalidateQueriesMock.mockReset();
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries: invalidateQueriesMock } as any);
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
  it("shows injury labels instead of codes", () => {
    renderScreen();
    expect(screen.getByText("Wrist / Elbow")).toBeInTheDocument();
    expect(screen.queryByText("wrist_elbow")).not.toBeInTheDocument();
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

  it("navigates to the Programs tab dashboard through the parent navigator after generation", async () => {
    const parentNavigation = { navigate: vi.fn() };
    const navigation = renderScreen();
    navigation.getParent.mockReturnValue(parentNavigation as any);

    fireEvent.click(screen.getByRole("button", { name: "Generate Program" }));

    await waitFor(() => {
      expect(setActiveProgramIdMock).toHaveBeenCalledWith("prog-1");
      expect(parentNavigation.navigate).toHaveBeenCalledWith("ProgramsTab", {
        screen: "ProgramDashboard",
        params: { programId: "prog-1" },
      });
    });
    expect(parentNavigation.navigate).not.toHaveBeenCalledWith("TodayTab");
    expect(navigation.navigate).not.toHaveBeenCalledWith("ProgramDashboard", expect.anything());
  });

  it("navigates to the new program's dashboard when regenerating with an active program", async () => {
    useActiveProgramsMock.mockReturnValueOnce({
      data: { programs: [{ id: "old-prog" }] },
      isLoading: false,
    } as any);
    const parentNavigation = { navigate: vi.fn() };
    const navigation = renderScreen();
    navigation.getParent.mockReturnValue(parentNavigation as any);

    fireEvent.click(screen.getByRole("button", { name: "Generate a new program" }));
    confirmReplace();

    await waitFor(() => expect(parentNavigation.navigate).toHaveBeenCalledWith("ProgramsTab", {
      screen: "ProgramDashboard",
      params: { programId: "prog-1" },
    }));
  });

  it("confirms replacing the primary type and Cancel sends nothing", () => {
    useActiveProgramsMock.mockReturnValue({ data: { programs: [
      { program_type: "conditioning", is_primary: false }, { program_type: "strength", is_primary: true },
    ] } } as any);
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Generate a new program" }));
    expect(alertMock).toHaveBeenCalledWith("Replace your current program?",
      "Your strength program will end. Workouts you've logged stay in History and still count toward your year.", expect.any(Array));
    const buttons = alertMock.mock.calls[0][2]!;
    expect(buttons.find(button => button.text === "Replace program")?.style).toBe("destructive");
    act(() => { buttons.find(button => button.text === "Cancel")?.onPress?.(); });
    expect(generateProgramMock).not.toHaveBeenCalled();
  });

  it("sends the replacement flag only after confirmation", async () => {
    useActiveProgramsMock.mockReturnValue({ data: { programs: [{ program_type: "hypertrophy" }] } } as any);
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Generate a new program" }));
    expect(generateProgramMock).not.toHaveBeenCalled();
    confirmReplace();
    await waitFor(() => expect(generateProgramMock).toHaveBeenCalledWith(expect.objectContaining({ replaceActiveProgram: true })));
  });

  it("confirms a same-type conflict and retries with the flag", async () => {
    generateProgramMock.mockRejectedValueOnce(new ApiError(409, "Archive it before generating a new one.", {
      code: "conflict_active_program_same_type", details: { active_program_type: "hypertrophy" },
    }));
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Generate Program" }));
    await waitFor(() => expect(alertMock).toHaveBeenCalledWith("Replace your current program?", expect.stringContaining("Your hypertrophy program will end."), expect.any(Array)));
    expect(screen.queryByText(/Archive it/)).not.toBeInTheDocument();
    confirmReplace();
    await waitFor(() => expect(generateProgramMock).toHaveBeenCalledTimes(2));
    expect(generateProgramMock.mock.calls[1][0].replaceActiveProgram).toBe(true);
  });

  it("formats schedule conflict dates without rendering server text", async () => {
    generateProgramMock.mockRejectedValueOnce(new ApiError(409, "RAW_SERVER_ARCHIVE_INSTRUCTION", {
      code: "schedule_conflict", details: { conflict_dates: ["2026-11-16", "2026-11-18", "2026-11-20", "2026-11-23", "2026-11-25"] },
    }));
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Generate Program" }));
    expect(await screen.findByText("This plan clashes with another active program on 16 Nov, 18 Nov, 20 Nov and 2 more. Change your training days or end that program first.")).toBeInTheDocument();
    expect(screen.queryByText(/RAW_SERVER/)).not.toBeInTheDocument();
  });

  it("refreshes active programs, Today overviews/sessions and calendar before navigation", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Generate Program" }));
    await waitFor(() => expect(setActiveProgramIdMock).toHaveBeenCalled());
    for (const queryKey of [queryKeys.activePrograms, queryKeys.programOverviews, queryKeys.sessionsByDate, queryKeys.combinedCalendar]) {
      expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey });
    }
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("View Today's Workout navigates to TodayTab without generating", () => {
    useActiveProgramsMock.mockReturnValueOnce({
      data: { programs: [{ id: "old-prog" }] },
      isLoading: false,
    } as any);
    const parentNavigation = { navigate: vi.fn() };
    const navigation = renderScreen();
    navigation.getParent.mockReturnValue(parentNavigation as any);

    fireEvent.click(screen.getByRole("button", { name: "View Today's Workout" }));

    expect(parentNavigation.navigate).toHaveBeenCalledWith("TodayTab");
    expect(generateProgramMock).not.toHaveBeenCalled();
  });

  it("preserveDraft skips resetFromProfile", () => {
    renderScreen({ preserveDraft: true });
    expect(resetFromProfileMock).not.toHaveBeenCalled();
  });

  it("routes the Body Metrics edit button to Step4BodyMetrics", () => {
    const navigation = renderScreen();
    const editButtons = screen.getAllByRole("button", { name: "Edit" });

    fireEvent.click(editButtons[4]);

    expect(navigation.navigate).toHaveBeenCalledWith("Step4BodyMetrics");
    expect(navigation.navigate).not.toHaveBeenCalledWith("Step3Schedule");
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
