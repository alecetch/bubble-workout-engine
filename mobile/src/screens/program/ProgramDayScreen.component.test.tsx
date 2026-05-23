import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramDayScreen } from "./ProgramDayScreen";
import { useCompleteProgram, useEntitlement, useMarkDayComplete, useProgramDayFull } from "../../api/hooks";
import { getPrsFeed } from "../../api/history";
import { getProgramEndCheck } from "../../api/programCompletion";
import { getProgramOverview } from "../../api/programViewer";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { allExercisesComplete, getSegmentLog, getWorkoutComplete, setWorkoutComplete } from "../../utils/localWorkoutLog";
import {
  buildExercise,
  buildProgramDay,
  buildSegment,
  mockZustandSelector,
  renderWithProviders,
} from "../../__test-utils__";

vi.unmock("@tanstack/react-query");

const appStorageMocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("@react-navigation/native", async () => {
  const ReactActual = await import("react");
  return {
    useFocusEffect: (cb: () => void) => {
      ReactActual.useEffect(() => cb(), [cb]);
    },
  };
});

vi.mock("expo-av", () => ({
  Audio: {
    Sound: {
      createAsync: vi.fn().mockResolvedValue({
        sound: { playAsync: vi.fn(), unloadAsync: vi.fn() },
      }),
    },
  },
  AVPlaybackStatus: {},
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium", Light: "light", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

vi.mock("../../api/hooks", () => ({
  queryKeys: {
    programOverview: (programId: string, opts: { userId?: string }) => [
      "programOverview",
      programId,
      opts.userId ?? null,
    ],
    programEndCheck: (programId: string) => ["programEndCheck", programId],
    segmentExerciseLogs: (segmentId: string, programDayId: string) => [
      "segmentExerciseLogs",
      segmentId,
      programDayId,
    ],
    programDayFull: (programDayId: string, opts: { userId?: string }) => [
      "programDayFull",
      programDayId,
      opts.userId ?? null,
    ],
  },
  useCompleteProgram: vi.fn(),
  useEntitlement: vi.fn(),
  useMarkDayComplete: vi.fn(),
  useProgramDayFull: vi.fn(),
}));

vi.mock("../../api/programCompletion", () => ({
  getProgramEndCheck: vi.fn(),
}));

vi.mock("../../api/programViewer", () => ({
  getProgramOverview: vi.fn(),
}));

vi.mock("../../api/history", () => ({
  getPrsFeed: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock("../../api/segmentLog", () => ({
  getSegmentExerciseLogs: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../utils/localWorkoutLog", () => ({
  getSegmentLog: vi.fn().mockResolvedValue(null),
  setSegmentLog: vi.fn().mockResolvedValue(undefined),
  getWorkoutComplete: vi.fn().mockResolvedValue(false),
  setWorkoutComplete: vi.fn().mockResolvedValue(undefined),
  getExerciseComplete: vi.fn().mockResolvedValue(false),
  setExerciseComplete: vi.fn().mockResolvedValue(undefined),
  allExercisesComplete: vi.fn().mockResolvedValue(true),
  hasAnySegmentLog: vi.fn().mockResolvedValue(false),
  getDayStatus: vi.fn().mockResolvedValue("scheduled"),
  _resetForTest: vi.fn(),
}));

vi.mock("../../utils/appStorage", () => ({
  getAppStorage: () => ({
    getItem: appStorageMocks.getItem,
    setItem: appStorageMocks.setItem,
  }),
}));

vi.mock("../../components/feedback/SkeletonBlock", () => ({
  SkeletonBlock: () => <div data-testid="skeleton-block" />,
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("../../components/program/EquipmentOverrideSheet", () => ({
  EquipmentOverrideSheet: () => null,
}));

vi.mock("../../components/program/ExerciseSwapSheet", () => ({
  ExerciseSwapSheet: () => null,
}));

vi.mock("../../components/program/SegmentCard", () => ({
  SegmentCard: ({ segment }: any) => (
    <section data-testid="segment-card">
      <h2>{segment?.segmentName ?? segment?.name ?? "Segment"}</h2>
      {segment?.exercises?.map((exercise: any) => (
        <p key={exercise.id}>{exercise.name}</p>
      ))}
    </section>
  ),
}));

vi.mock("../../components/program/SessionSummaryModal", () => ({
  SessionSummaryModal: ({ onDismiss, totalSets, totalVolumeKg, visible }: any) =>
    visible ? (
      <div role="dialog" aria-label="Session summary">
        <p>Great work</p>
        <p>{totalSets} sets</p>
        <p>{totalVolumeKg} kg</p>
        <button type="button" onClick={() => onDismiss?.()}>
          Finish
        </button>
      </div>
    ) : null,
}));

const useProgramDayFullMock = vi.mocked(useProgramDayFull);
const useEntitlementMock = vi.mocked(useEntitlement);
const useMarkDayCompleteMock = vi.mocked(useMarkDayComplete);
const useCompleteProgramMock = vi.mocked(useCompleteProgram);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);
const useSessionStoreMock = vi.mocked(useSessionStore);
const getPrsFeedMock = vi.mocked(getPrsFeed);
const getProgramOverviewMock = vi.mocked(getProgramOverview);
const getProgramEndCheckMock = vi.mocked(getProgramEndCheck);
const getWorkoutCompleteMock = vi.mocked(getWorkoutComplete);
const getSegmentLogMock = vi.mocked(getSegmentLog);
const setWorkoutCompleteMock = vi.mocked(setWorkoutComplete);
const allExercisesCompleteMock = vi.mocked(allExercisesComplete);

const markDayMutateMock = vi.fn();
const completeProgramMutateMock = vi.fn();

const mockDay = buildProgramDay(
  {
    day: {
    id: "day-1",
    programDayId: "day-1",
    programId: "prog-1",
    label: "Lower Body",
    type: "strength",
    sessionDuration: 45,
    scheduledWeekday: "Mon",
    weekNumber: 1,
    equipmentOverridePresetSlug: null,
    equipmentOverrideItemSlugs: [],
  } as any,
  },
  [
    buildSegment(
      {
      id: "seg-1",
      purpose: "main",
      segmentType: "single",
      segmentName: "Squats",
      orderInDay: 1,
      },
      [
        buildExercise({
          id: "ex-1",
          exerciseId: "back-squat",
          programExerciseId: "pe-1",
          name: "Back Squat",
          adaptationDecision: null,
        } as any),
      ],
    ),
    buildSegment(
      {
      id: "seg-2",
      purpose: "accessory",
      segmentType: "single",
      segmentName: "Accessories",
      orderInDay: 2,
      },
      [
        buildExercise({
          id: "ex-2",
          exerciseId: "leg-press",
          programExerciseId: "pe-2",
          name: "Leg Press",
          adaptationDecision: null,
        } as any),
      ],
    ),
  ],
);

let queryClient: QueryClient;

function renderScreen() {
  const parentNavigation = { navigate: vi.fn() };
  const navigation = {
    navigate: vi.fn(),
    goBack: vi.fn(),
    getParent: vi.fn(() => parentNavigation),
    setOptions: vi.fn(),
  };

  ({ queryClient } = renderWithProviders(
    <ProgramDayScreen
      route={{ params: { programDayId: "day-1" } } as any}
      navigation={navigation as any}
    />,
  ));

  return { navigation, parentNavigation };
}

async function waitForLocalStateLoad() {
  await waitFor(() => expect(getWorkoutCompleteMock).toHaveBeenCalledWith("day-1"));
}

describe("ProgramDayScreen", () => {
  beforeEach(() => {
    markDayMutateMock.mockReset();
    markDayMutateMock.mockResolvedValue({ ok: true });
    completeProgramMutateMock.mockReset();
    completeProgramMutateMock.mockResolvedValue({ ok: true });
    getWorkoutCompleteMock.mockResolvedValue(false);
    getSegmentLogMock.mockResolvedValue(null);
    allExercisesCompleteMock.mockResolvedValue(true);
    setWorkoutCompleteMock.mockResolvedValue(undefined);
    getPrsFeedMock.mockResolvedValue({ rows: [], mode: "prs_28d", heaviest: null });
    appStorageMocks.getItem.mockReset();
    appStorageMocks.getItem.mockResolvedValue(null);
    appStorageMocks.setItem.mockReset();
    appStorageMocks.setItem.mockResolvedValue(undefined);
    getProgramOverviewMock.mockResolvedValue({
      calendarDays: [
        {
          isTrainingDay: true,
          programDayId: "day-1",
          weekNumber: 1,
          status: "scheduled",
        },
      ],
    } as any);
    getProgramEndCheckMock.mockResolvedValue({
      lifecycleStatus: "active",
      isLastScheduledDayComplete: false,
      missedWorkoutsCount: 1,
      canCompleteWithSkips: false,
    } as any);

    useProgramDayFullMock.mockReturnValue({
      data: mockDay,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    useEntitlementMock.mockReturnValue({
      data: { is_active: true },
      isSuccess: true,
    } as any);
    useMarkDayCompleteMock.mockReturnValue({
      mutateAsync: markDayMutateMock,
      isPending: false,
    } as any);
    useCompleteProgramMock.mockReturnValue({
      mutateAsync: completeProgramMutateMock,
      isPending: false,
    } as any);
    mockZustandSelector(useOnboardingStoreMock as any, { userId: "onboard-user" });
    mockZustandSelector(useSessionStoreMock as any, { userId: "user-1", activeProgramId: "prog-1" });
  });

  afterEach(() => {
    queryClient?.clear();
    vi.useRealTimers();
  });
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("renders loading skeletons while the workout day loads", async () => {
    useProgramDayFullMock.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);

    renderScreen();

    expect(screen.getAllByTestId("skeleton-block").length).toBeGreaterThan(0);
    expect(screen.queryByText("Couldn't load workout")).not.toBeInTheDocument();
    await waitForLocalStateLoad();
  });

  it("renders error state with retry", async () => {
    const refetch = vi.fn();
    useProgramDayFullMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "Network down" },
      refetch,
    } as any);

    renderScreen();

    expect(screen.getByText("Couldn't load workout")).toBeInTheDocument();
    expect(screen.getByText("Network down")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
    await waitForLocalStateLoad();
  });

  it("renders the day label", async () => {
    renderScreen();

    expect(screen.getByText("Lower Body")).toBeInTheDocument();
    await waitForLocalStateLoad();
  });

  it("renders segment names", async () => {
    renderScreen();

    expect(screen.getByText("Squats")).toBeInTheDocument();
    expect(screen.getByText("Accessories")).toBeInTheDocument();
    await waitForLocalStateLoad();
  });

  it("renders exercise names within segments", async () => {
    renderScreen();

    expect(screen.getByText("Back Squat")).toBeInTheDocument();
    expect(screen.getByText("Leg Press")).toBeInTheDocument();
    await waitForLocalStateLoad();
  });

  it("routes inactive entitlement users to the paywall", async () => {
    useEntitlementMock.mockReturnValueOnce({
      data: { is_active: false },
      isSuccess: true,
    } as any);

    const { parentNavigation } = renderScreen();

    await waitFor(() =>
      expect(parentNavigation.navigate).toHaveBeenCalledWith("HomeTab", { screen: "Paywall" }),
    );
  });

  it("shows the completion CTA when workout state is ready", async () => {
    getWorkoutCompleteMock.mockResolvedValueOnce(true);

    renderScreen();

    expect(screen.getByRole("button", { name: "Workout complete" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("calls the mark-complete mutation after the summary is dismissed", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Workout complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

    await waitFor(() =>
      expect(markDayMutateMock).toHaveBeenCalledWith({
        programDayId: "day-1",
        isCompleted: true,
        userId: "user-1",
      }),
    );
    expect(setWorkoutCompleteMock).toHaveBeenCalledWith("day-1", true);
  });

  it("navigates to ProgramDashboard after an ordinary workout completion", async () => {
    getProgramOverviewMock.mockResolvedValueOnce({
      calendarDays: [
        {
          isTrainingDay: true,
          programDayId: "day-1",
          weekNumber: 1,
          status: "scheduled",
        },
        {
          isTrainingDay: true,
          programDayId: "day-2",
          weekNumber: 1,
          status: "scheduled",
        },
      ],
    } as any);
    const { navigation } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Workout complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith("ProgramDashboard", {
        programId: "prog-1",
        showReviewPrompt: undefined,
        weekCompleteNumber: undefined,
        weekCompleteSessions: undefined,
      }),
    );
  });

  it("does not navigate to ProgramDashboard when lifecycleStatus is completed", async () => {
    getProgramEndCheckMock.mockResolvedValueOnce({
      lifecycleStatus: "completed",
      isLastScheduledDayComplete: false,
      missedWorkoutsCount: 0,
      canCompleteWithSkips: false,
    } as any);
    const { navigation } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Workout complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith("ProgramComplete", { programId: "prog-1" }),
    );
    expect(navigation.navigate).not.toHaveBeenCalledWith("ProgramDashboard", expect.anything());
  });

  it("does not navigate to ProgramDashboard when canCompleteWithSkips is true", async () => {
    getProgramEndCheckMock.mockResolvedValueOnce({
      lifecycleStatus: "active",
      isLastScheduledDayComplete: true,
      missedWorkoutsCount: 2,
      canCompleteWithSkips: true,
    } as any);
    const { navigation } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Workout complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith("ProgramEndCheck", { programId: "prog-1" }),
    );
    expect(navigation.navigate).not.toHaveBeenCalledWith("ProgramDashboard", expect.anything());
  });

  it("defers the account-scoped review prompt to ProgramDashboard after a PR", async () => {
    getPrsFeedMock.mockResolvedValueOnce({
      rows: [{ exerciseName: "Back Squat", estimatedE1rmKg: 120 }],
    } as any);

    const { navigation } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Workout complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith(
        "ProgramDashboard",
        expect.objectContaining({ programId: "prog-1", showReviewPrompt: true }),
      ),
    );
    expect(screen.queryByText("Nice PR.")).not.toBeInTheDocument();
  });

  it("defers the week-complete banner to ProgramDashboard", async () => {
    getProgramOverviewMock.mockResolvedValueOnce({
      calendarDays: [
        {
          isTrainingDay: true,
          programDayId: "day-0",
          weekNumber: 1,
          status: "complete",
        },
        {
          isTrainingDay: true,
          programDayId: "day-1",
          weekNumber: 1,
          status: "scheduled",
        },
      ],
    } as any);

    const { navigation } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Workout complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith(
        "ProgramDashboard",
        expect.objectContaining({
          programId: "prog-1",
          weekCompleteNumber: 1,
          weekCompleteSessions: 2,
        }),
      ),
    );
    expect(screen.queryByText("Week 1 complete!")).not.toBeInTheDocument();
  });

  it("shows the session summary before completing the workout", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Workout complete" }));

    expect(await screen.findByRole("dialog", { name: "Session summary" })).toBeInTheDocument();
    expect(screen.getByText("Great work")).toBeInTheDocument();
  });

  it("calls allExercisesComplete on mount with the day's exercise IDs", async () => {
    renderScreen();

    await waitFor(() =>
      expect(allExercisesCompleteMock).toHaveBeenCalledWith(
        "day-1",
        expect.arrayContaining(["ex-1", "ex-2"]),
      ),
    );
  });

  it("navigates to the end-check screen when completion with skips is available", async () => {
    getProgramEndCheckMock.mockResolvedValueOnce({
      lifecycleStatus: "active",
      isLastScheduledDayComplete: true,
      missedWorkoutsCount: 2,
      canCompleteWithSkips: true,
    } as any);
    const { navigation } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Workout complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith("ProgramEndCheck", { programId: "prog-1" }),
    );
  });
});
