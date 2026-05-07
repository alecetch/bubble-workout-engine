import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramDashboardScreen } from "./ProgramDashboardScreen";
import { useDayPreview, useProgramEndCheck, useProgramOverview } from "../../api/hooks";
import { getProgramOverview } from "../../api/programViewer";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { getDayStatus } from "../../utils/localWorkoutLog";

vi.unmock("@tanstack/react-query");

vi.mock("@react-navigation/native", async () => {
  const ReactActual = await import("react");
  return {
    useFocusEffect: (cb: () => void) => {
      ReactActual.useEffect(() => cb(), [cb]);
    },
  };
});

vi.mock("../../api/hooks", () => ({
  useDayPreview: vi.fn(),
  useProgramEndCheck: vi.fn(),
  useProgramOverview: vi.fn(),
}));

vi.mock("../../api/programViewer", () => ({
  getProgramOverview: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../utils/localWorkoutLog", () => ({
  getDayStatus: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("../../components/program/DayPreviewCard", () => ({
  DayPreviewCard: ({ preview }: any) => <div>Preview: {preview?.label ?? "No preview"}</div>,
}));

const useProgramOverviewMock = vi.mocked(useProgramOverview);
const useProgramEndCheckMock = vi.mocked(useProgramEndCheck);
const useDayPreviewMock = vi.mocked(useDayPreview);
const useSessionStoreMock = vi.mocked(useSessionStore);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);
const getDayStatusMock = vi.mocked(getDayStatus);
const getProgramOverviewMock = vi.mocked(getProgramOverview);

const setActiveProgramIdMock = vi.fn();
let queryClient: QueryClient;

function data(overrides: Record<string, unknown> = {}) {
  return {
    program: { id: "prog-1", title: "Strength Block", summary: "Build strength" },
    weeks: [{ weekNumber: 1 }],
    calendarDays: [
      {
        id: "cal-1",
        calendarDate: "2026-05-01",
        scheduledDate: "2026-05-01",
        isTrainingDay: true,
        programDayId: "day-1",
        weekNumber: 1,
      },
    ],
    selectedDayPreview: { programDayId: "day-1", label: "Day 1", type: "strength", sessionDuration: 45 },
    ...overrides,
  };
}

function renderDashboard(
  navigation = { navigate: vi.fn(), getParent: vi.fn(() => null) },
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ProgramDashboardScreen
        route={{ params: { programId: "prog-1" } } as any}
        navigation={navigation as any}
      />
    </QueryClientProvider>,
  );
  return navigation;
}

describe("ProgramDashboardScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    setActiveProgramIdMock.mockReset();
    getProgramOverviewMock.mockReset();
    useSessionStoreMock.mockImplementation((selector: any) =>
      selector({ userId: "user-1", setActiveProgramId: setActiveProgramIdMock }),
    );
    useOnboardingStoreMock.mockImplementation((selector: any) => selector({ userId: "onboard-user" }));
    useProgramOverviewMock.mockReturnValue({
      data: data(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    useProgramEndCheckMock.mockReturnValue({
      data: { lifecycleStatus: "active", canCompleteWithSkips: false },
      refetch: vi.fn(),
    } as any);
    useDayPreviewMock.mockReturnValue({ data: undefined } as any);
    getDayStatusMock.mockResolvedValue("scheduled");
  });

  afterEach(() => {
    queryClient?.clear();
    vi.useRealTimers();
  });

  it("renders loading skeletons without an error", () => {
    useProgramOverviewMock.mockReturnValueOnce({ isLoading: true, data: undefined } as any);
    renderDashboard();
    expect(screen.queryByText("Unable to load dashboard")).not.toBeInTheDocument();
  });

  it("renders error state with retry", () => {
    useProgramOverviewMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: { message: "fail" },
      data: undefined,
      refetch: vi.fn(),
    } as any);
    renderDashboard();
    expect(screen.getByText("Unable to load dashboard")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("renders the program title", () => {
    renderDashboard();
    expect(screen.getByText("Strength Block")).toBeInTheDocument();
  });

  it("renders completion banner and navigates to ProgramComplete", () => {
    useProgramEndCheckMock.mockReturnValueOnce({
      data: { lifecycleStatus: "completed", canCompleteWithSkips: false },
      refetch: vi.fn(),
    } as any);
    const navigation = renderDashboard();
    fireEvent.click(screen.getByText("Program complete"));
    expect(navigation.navigate).toHaveBeenCalledWith("ProgramComplete", { programId: "prog-1" });
  });

  it("renders end-check counts and navigates to ProgramEndCheck", () => {
    useProgramEndCheckMock.mockReturnValueOnce({
      data: {
        lifecycleStatus: "active",
        canCompleteWithSkips: true,
        missedWorkoutsCount: 2,
        skippedWorkoutsCount: 1,
      },
      refetch: vi.fn(),
    } as any);
    const navigation = renderDashboard();
    expect(screen.getByText(/2 missed workouts, 1 skipped/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("End of block reached"));
    expect(navigation.navigate).toHaveBeenCalledWith("ProgramEndCheck", { programId: "prog-1" });
  });

  it("renders missed-session banner and opens recalibration", async () => {
    useProgramOverviewMock.mockReturnValue({
      data: data({
        calendarDays: [
          { calendarDate: "2026-04-27", isTrainingDay: true, programDayId: "day-1", weekNumber: 1 },
          { calendarDate: "2026-04-28", isTrainingDay: true, programDayId: "day-2", weekNumber: 1 },
          { calendarDate: "2026-04-29", isTrainingDay: true, programDayId: "day-3", weekNumber: 1 },
          { calendarDate: "2026-05-01", isTrainingDay: true, programDayId: "day-4", weekNumber: 1 },
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    const navigation = renderDashboard();
    expect(screen.getByText("3 sessions missed")).toBeInTheDocument();
    fireEvent.click(screen.getByText("3 sessions missed"));
    expect(navigation.navigate).toHaveBeenCalledWith("RecalibrateA");
  });

  it("hides missed-session banner when the program is complete", () => {
    useProgramEndCheckMock.mockReturnValue({
      data: { lifecycleStatus: "completed", canCompleteWithSkips: false },
      refetch: vi.fn(),
    } as any);
    useProgramOverviewMock.mockReturnValue({
      data: data({
        calendarDays: [
          { calendarDate: "2026-04-27", isTrainingDay: true, programDayId: "day-1", weekNumber: 1 },
          { calendarDate: "2026-04-28", isTrainingDay: true, programDayId: "day-2", weekNumber: 1 },
          { calendarDate: "2026-04-29", isTrainingDay: true, programDayId: "day-3", weekNumber: 1 },
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    renderDashboard();
    expect(screen.getByText("Program complete")).toBeInTheDocument();
    expect(screen.queryByText(/sessions missed/)).not.toBeInTheDocument();
  });
});

describe("ProgramDashboardScreen - React Query integration", () => {
  let overviewStaleTime: number;

  function useRealOverviewQuery(programId: string, opts: { userId?: string }) {
    return useQuery({
      queryKey: ["programOverview", programId, opts.userId ?? null],
      queryFn: () => getProgramOverview(programId, opts),
      enabled: Boolean(programId && opts.userId),
      staleTime: overviewStaleTime,
    });
  }

  function renderWithRealQuery(
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    navigation = { navigate: vi.fn(), getParent: vi.fn(() => null) },
  ) {
    const view = render(
      <QueryClientProvider client={client}>
        <ProgramDashboardScreen
          route={{ params: { programId: "prog-1" } } as any}
          navigation={navigation as any}
        />
      </QueryClientProvider>,
    );
    return { ...view, queryClient: client, navigation };
  }

  beforeEach(() => {
    vi.useRealTimers();
    overviewStaleTime = 5 * 60 * 1000;
    setActiveProgramIdMock.mockReset();
    getProgramOverviewMock.mockReset();
    useSessionStoreMock.mockImplementation((selector: any) =>
      selector({ userId: "user-1", setActiveProgramId: setActiveProgramIdMock }),
    );
    useOnboardingStoreMock.mockImplementation((selector: any) => selector({ userId: "onboard-user" }));
    useProgramOverviewMock.mockImplementation(useRealOverviewQuery as any);
    useProgramEndCheckMock.mockReturnValue({
      data: { lifecycleStatus: "active", canCompleteWithSkips: false },
      refetch: vi.fn(),
    } as any);
    useDayPreviewMock.mockReturnValue({ data: undefined } as any);
    getDayStatusMock.mockResolvedValue("scheduled");
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it("serves a second mount from cache without a duplicate overview request", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getProgramOverviewMock.mockResolvedValue(data() as any);

    const first = renderWithRealQuery(client);
    expect(await screen.findByText("Strength Block")).toBeInTheDocument();
    first.unmount();

    renderWithRealQuery(client);
    expect(await screen.findByText("Strength Block")).toBeInTheDocument();

    expect(getProgramOverviewMock).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it("background-refetches stale cached overview data", async () => {
    overviewStaleTime = 0;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    client.setQueryData(["programOverview", "prog-1", "user-1"], data());
    getProgramOverviewMock.mockResolvedValue(data({ program: { id: "prog-1", title: "Updated Block" } }) as any);

    renderWithRealQuery(client);

    expect(await screen.findByText("Strength Block")).toBeInTheDocument();
    expect(getProgramOverviewMock).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it("shows dashboard error state when the overview request fails", async () => {
    overviewStaleTime = 0;
    getProgramOverviewMock.mockRejectedValue(new Error("overview failed"));

    renderWithRealQuery();

    expect(await screen.findByText("Unable to load dashboard")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });
});
