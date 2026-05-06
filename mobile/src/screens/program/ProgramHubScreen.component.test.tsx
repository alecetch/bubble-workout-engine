import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramHubScreen } from "./ProgramHubScreen";
import { useSessionStore } from "../../state/session/sessionStore";

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    TouchableOpacity: ({ accessibilityLabel, accessibilityRole, children, disabled, onPress, style }: any) => (
      <div
        aria-label={accessibilityLabel}
        aria-disabled={disabled ? "true" : undefined}
        role={accessibilityRole ?? "button"}
        style={style}
        onClick={() => {
          if (!disabled) onPress?.();
        }}
      >
        {children}
      </div>
    ),
  };
});

vi.mock("../../api/activePrograms", () => ({
  fetchActivePrograms: vi.fn(),
  fetchCombinedCalendar: vi.fn(),
  fetchSessionsByDate: vi.fn(),
  setPrimaryProgram: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
  useQuery: vi.fn((config: { queryKey: string[] }) => {
    const key = config.queryKey[0];
    if (key === "activePrograms") return activeProgramsQueryState;
    if (key === "combinedCalendar") return combinedCalendarQueryState;
    return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
  }),
  useMutation: vi.fn((config: any) => {
    mutationCallIndex += 1;
    const isMakePrimaryMutation = mutationCallIndex === 2;
    return {
      mutate: (variables: unknown) => {
        config.onMutate?.(variables);
        if (isMakePrimaryMutation && makePrimaryShouldFail) {
          config.onError?.(new Error("primary failed"), variables);
          return;
        }
        config.onSuccess?.({ ok: true }, variables);
      },
      isPending: false,
    };
  }),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../components/program/CombinedCalendar", () => ({
  CombinedCalendar: () => <div data-testid="combined-calendar" />,
}));

vi.mock("../../components/program/SessionPickerSheet", () => ({
  SessionPickerSheet: () => null,
}));

const useSessionStoreMock = vi.mocked(useSessionStore);
const setActiveProgramIdMock = vi.fn();

let mutationCallIndex = 0;
let makePrimaryShouldFail = false;
let activeProgramsQueryState: any;
let combinedCalendarQueryState: any;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function shouldSuppressNestedButtonWarning(message?: unknown, ...args: unknown[]) {
  const fullMessage = [message, ...args].map(String).join(" ");
  return (
    fullMessage.includes("In HTML, <button> cannot be a descendant of <button>") ||
    fullMessage.includes("<button> cannot contain a nested <button>")
  );
}

function mockProgram(overrides: Record<string, unknown> = {}) {
  return {
    program_id: "prog-1",
    program_title: "Strength Builder",
    program_type: "strength",
    is_primary: true,
    status: "active",
    weeks_count: 8,
    days_per_week: 4,
    start_date: "2026-05-01",
    hero_media_id: null,
    today_session_count: 0,
    next_session_date: "2026-05-06",
    ...overrides,
  };
}

function renderScreen() {
  mutationCallIndex = 0;
  const navigation = { navigate: vi.fn() };
  render(<ProgramHubScreen navigation={navigation as any} route={{} as any} />);
  return navigation;
}

describe("ProgramHubScreen", () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((message?: unknown, ...args: unknown[]) => {
      if (shouldSuppressNestedButtonWarning(message, ...args)) {
        return;
      }
      originalConsoleError(message, ...args);
    });
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation((message?: unknown, ...args: unknown[]) => {
      if (shouldSuppressNestedButtonWarning(message, ...args)) {
        return;
      }
      originalConsoleWarn(message, ...args);
    });
    setActiveProgramIdMock.mockReset();
    makePrimaryShouldFail = false;
    activeProgramsQueryState = {
      data: {
        primary_program_id: "prog-1",
        programs: [
          mockProgram(),
          mockProgram({
            program_id: "prog-2",
            program_title: "Hypertrophy Block",
            program_type: "hypertrophy",
            is_primary: false,
          }),
        ],
        today_sessions: [],
      },
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: vi.fn(),
    };
    combinedCalendarQueryState = {
      data: { ok: true, days: [] },
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: vi.fn(),
    };
    useSessionStoreMock.mockImplementation((selector: any) =>
      selector({ activeProgramId: "prog-1", setActiveProgramId: setActiveProgramIdMock }),
    );
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
  });

  it("renders loading skeleton while activePrograms loads", () => {
    activeProgramsQueryState = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };

    renderScreen();

    expect(screen.queryByText("Could not load programs.")).not.toBeInTheDocument();
  });

  it("renders empty state when no programs enrolled", () => {
    activeProgramsQueryState.data = { primary_program_id: null, programs: [], today_sessions: [] };

    renderScreen();

    expect(screen.getByText("No active programs. Generate one to get started.")).toBeInTheDocument();
  });

  it("renders program cards with their titles", () => {
    renderScreen();

    expect(screen.getByText("Strength Builder")).toBeInTheDocument();
    expect(screen.getByText("Hypertrophy Block")).toBeInTheDocument();
  });

  it("shows PRIMARY badge on the primary program only", () => {
    renderScreen();

    expect(screen.getAllByText("PRIMARY")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Strength Builder, primary program" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hypertrophy Block, secondary program" })).toBeInTheDocument();
  });

  it("calls setActiveProgramId and navigates to dashboard on program tap", () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Strength Builder, primary program" }));

    expect(setActiveProgramIdMock).toHaveBeenCalledWith("prog-1");
    expect(navigation.navigate).toHaveBeenCalledWith("ProgramDashboard", { programId: "prog-1" });
  });

  it("shows make-primary error banner on mutation failure", async () => {
    makePrimaryShouldFail = true;
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Make Hypertrophy Block your primary program" }));

    expect(await screen.findByText("Could not update primary program. Please try again.")).toBeInTheDocument();
  });

  it("renders error state with Retry on programs fetch failure", () => {
    activeProgramsQueryState = {
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    };

    renderScreen();

    expect(screen.getByText("Could not load programs.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(activeProgramsQueryState.refetch).toHaveBeenCalledTimes(1);
    expect(combinedCalendarQueryState.refetch).toHaveBeenCalledTimes(1);
  });
});
