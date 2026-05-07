import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDecisionHistory } from "../../api/programViewer";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { ExerciseDecisionHistoryScreen } from "./ExerciseDecisionHistoryScreen";

vi.mock("../../api/programViewer", () => ({
  fetchDecisionHistory: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress, accessibilityLabel }: any) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPress?.()}
      aria-label={accessibilityLabel}
    >
      {children}
    </button>
  ),
}));

const PAGE1_FIXTURE = {
  decisions: [
    {
      id: "d-1",
      displayLabel: "Bench Press",
      outcome: "increase_load",
      scheduledDate: "2025-01-06",
      displayReason: "Strong session",
      confidence: "high",
    },
    {
      id: "d-2",
      displayLabel: "Bench Press",
      outcome: "hold",
      scheduledDate: "2025-01-13",
      displayReason: "On track",
      confidence: "medium",
    },
    {
      id: "d-3",
      displayLabel: "Bench Press",
      outcome: "deload_local",
      scheduledDate: "2025-01-20",
      displayReason: "Fatigue detected",
      confidence: "low",
    },
  ],
  totalDecisions: 3,
};

const mockFetchDecisionHistory = vi.mocked(fetchDecisionHistory);
const useSessionStoreMock = vi.mocked(useSessionStore);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);

function renderScreen() {
  return render(
    <ExerciseDecisionHistoryScreen
      route={{ params: { programExerciseId: "pe-1", exerciseName: "Bench Press" } } as any}
      navigation={{ goBack: vi.fn(), navigate: vi.fn(), setOptions: vi.fn() } as any}
    />,
  );
}

describe("ExerciseDecisionHistoryScreen", () => {
  beforeEach(() => {
    mockFetchDecisionHistory.mockReset();
    mockFetchDecisionHistory.mockResolvedValue(PAGE1_FIXTURE as any);
    useSessionStoreMock.mockImplementation((selector: any) =>
      selector({ userId: "user-123" }),
    );
    useOnboardingStoreMock.mockImplementation((selector: any) =>
      selector({ userId: "onboard-user" }),
    );
  });

  it("shows loading indicator on initial fetch before promise resolves", () => {
    mockFetchDecisionHistory.mockReturnValue(new Promise(() => {}));

    renderScreen();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText(/No adaptation decisions yet/)).not.toBeInTheDocument();
  });

  it("shows error message when fetchDecisionHistory rejects", async () => {
    mockFetchDecisionHistory.mockRejectedValue(new Error("Network error"));

    renderScreen();

    await waitFor(() => expect(screen.getByText("Network error")).toBeInTheDocument());
  });

  it("shows empty state text when totalDecisions is 0", async () => {
    mockFetchDecisionHistory.mockResolvedValue({ decisions: [], totalDecisions: 0 } as any);

    renderScreen();

    await waitFor(() =>
      expect(screen.getByText(/No adaptation decisions yet/)).toBeInTheDocument(),
    );
  });

  it("renders decision row with reason and formatted date", async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByText("Strong session")).toBeInTheDocument());
    expect(screen.getByText(/(?:Jan.+6|6.+Jan)/)).toBeInTheDocument();
  });

  it("outcome pill shows correct label text for each outcome", async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText(/Load/)).toBeInTheDocument();
      expect(screen.getByText("Hold")).toBeInTheDocument();
      expect(screen.getByText("Deload")).toBeInTheDocument();
    });
  });

  it("Load more button appears when totalDecisions > decisions.length and calls fetchDecisionHistory with offset", async () => {
    mockFetchDecisionHistory
      .mockResolvedValueOnce({
        decisions: PAGE1_FIXTURE.decisions,
        totalDecisions: 25,
      } as any)
      .mockResolvedValueOnce({
        decisions: [
          {
            ...PAGE1_FIXTURE.decisions[0],
            id: "d-4",
            scheduledDate: "2025-01-27",
          },
        ],
        totalDecisions: 25,
      } as any);

    renderScreen();

    await waitFor(() => expect(screen.getByText("Load more")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Load more"));

    await waitFor(() => expect(mockFetchDecisionHistory).toHaveBeenCalledTimes(2));
    expect(mockFetchDecisionHistory.mock.calls[1]).toEqual([
      "pe-1",
      { userId: "user-123", limit: 20, offset: 3 },
    ]);
  });
});
