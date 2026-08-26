import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramEndCheckScreen } from "./ProgramEndCheckScreen";
import { useCompleteProgram, useProgramEndCheck } from "../../api/hooks";

vi.mock("../../api/hooks", () => ({
  useCompleteProgram: vi.fn(),
  useProgramEndCheck: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const useProgramEndCheckMock = vi.mocked(useProgramEndCheck);
const useCompleteProgramMock = vi.mocked(useCompleteProgram);
const mutateAsyncMock = vi.fn();

const mockEndCheck = {
  programId: "prog-1",
  programTitle: "Strength Block",
  lifecycleStatus: "in_progress",
  completedMode: null,
  canCompleteWithSkips: true,
  missedWorkoutsCount: 2,
  completedDays: 7,
  totalDays: 9,
  isLastScheduledDayComplete: true,
};

function renderScreen(
  navigation: { navigate: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn>; getParent: ReturnType<typeof vi.fn> } = {
    navigate: vi.fn(),
    replace: vi.fn(),
    getParent: vi.fn(() => null),
  },
) {
  render(
    <ProgramEndCheckScreen
      route={{ params: { programId: "prog-1" } } as any}
      navigation={navigation as any}
    />,
  );
  return navigation;
}

describe("ProgramEndCheckScreen", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue({ ok: true });
    useProgramEndCheckMock.mockReturnValue({
      data: mockEndCheck,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    useCompleteProgramMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("renders loading state", () => {
    useProgramEndCheckMock.mockReturnValueOnce({ isLoading: true, data: undefined } as any);
    renderScreen();
    expect(screen.getByText("Checking end-of-block status...")).toBeInTheDocument();
  });

  it("renders error state with retry", () => {
    const refetch = vi.fn();
    useProgramEndCheckMock.mockReturnValueOnce({
      isLoading: false,
      isError: true,
      data: undefined,
      error: { message: "fail" },
      refetch,
    } as any);
    renderScreen();
    expect(screen.getByText("Unable to check program status")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows missed workout count and skipped-workout footnote", () => {
    renderScreen();
    expect(screen.getByText(/2 missed workouts/)).toBeInTheDocument();
    expect(screen.getByText("Skipped workouts will remain incomplete.")).toBeInTheDocument();
  });

  it("shows days completed and total", () => {
    renderScreen();
    expect(screen.getByText("7/9")).toBeInTheDocument();
  });

  it("shows complete-anyway CTA when completion with skips is allowed", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: "Complete program anyway" })).toBeInTheDocument();
  });

  it("navigates in-stack when finishing missed workouts", () => {
    const parentNavigate = vi.fn();
    const navigation = {
      navigate: vi.fn(),
      replace: vi.fn(),
      getParent: vi.fn(() => ({ navigate: parentNavigate })),
    };
    renderScreen(navigation);

    fireEvent.click(screen.getByRole("button", { name: "Finish missed workouts" }));

    expect(navigation.navigate).toHaveBeenCalledWith("ProgramDashboard", { programId: "prog-1" });
    expect(navigation.getParent).not.toHaveBeenCalled();
    expect(parentNavigate).not.toHaveBeenCalledWith(
      "ProgramsTab",
      expect.anything(),
    );
  });

  it("calls completion mutation with the with_skips payload", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Complete program anyway" }));
    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith({ programId: "prog-1", mode: "with_skips" }),
    );
  });

  it("replaces with ProgramComplete after successful completion", async () => {
    const navigation = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Complete program anyway" }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("ProgramComplete", { programId: "prog-1" }),
    );
  });
});
