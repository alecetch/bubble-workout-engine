import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SplitReviewScreen } from "./SplitReviewScreen";
import { useMe, useSplitRecommendation, useUpdateClientProfile } from "../../api/hooks";
import { authenticatedFetch } from "../../api/client";

vi.mock("../../api/hooks", () => ({
  useMe: vi.fn(),
  useSplitRecommendation: vi.fn(),
  useUpdateClientProfile: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  authenticatedFetch: vi.fn(),
}));

vi.mock("../../components/onboarding/FocusPickerSheet", () => ({
  FocusPickerSheet: ({ visible, onSelect, onClose }: any) =>
    visible ? (
      <div>
        <button type="button" onClick={() => onSelect("lower_body")}>
          Pick lower_body
        </button>
        <button type="button" onClick={onClose}>
          Close picker
        </button>
      </div>
    ) : null,
  FOCUS_LABELS: {
    full_body: "Full Body",
    upper_body: "Upper Body",
    lower_body: "Lower Body",
    push: "Push",
    pull: "Pull",
    legs: "Legs",
  },
}));

vi.mock("../../components/onboarding/SectionCard", () => ({
  SectionCard: ({ title, children }: any) => (
    <section>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  ),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress, testID }: any) => (
    <button
      type="button"
      data-testid={testID}
      disabled={disabled}
      onClick={() => onPress?.()}
    >
      {children}
    </button>
  ),
}));

const useMeMock = vi.mocked(useMe);
const useSplitRecommendationMock = vi.mocked(useSplitRecommendation);
const useUpdateClientProfileMock = vi.mocked(useUpdateClientProfile);
const authenticatedFetchMock = vi.mocked(authenticatedFetch);

const mutateAsyncMock = vi.fn();
const navigateMock = vi.fn();
const popToTopMock = vi.fn();
const refetchMock = vi.fn();

function buildNavigation() {
  return {
    navigate: navigateMock,
    popToTop: popToTopMock,
    goBack: vi.fn(),
    replace: vi.fn(),
  } as any;
}

function renderScreen(params: Record<string, unknown> = {}) {
  return render(
    <SplitReviewScreen
      route={{ params } as any}
      navigation={buildNavigation()}
    />,
  );
}

const defaultSplitData = {
  ok: true,
  programType: "hypertrophy",
  daysPerWeek: 3,
  recommendation: ["full_body", "full_body", "full_body"],
  existingPreference: null,
  existingModifiedByUser: false,
};

describe("SplitReviewScreen", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    popToTopMock.mockReset();
    mutateAsyncMock.mockReset();
    authenticatedFetchMock.mockReset();
    refetchMock.mockReset();

    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
      isError: false,
    } as any);

    useSplitRecommendationMock.mockReturnValue({
      data: defaultSplitData,
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    } as any);

    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
    } as any);

    mutateAsyncMock.mockResolvedValue({});
    authenticatedFetchMock.mockResolvedValue({});
  });

  // ── Loading state ──────────────────────────────────────────────────────

  it("shows loading indicator when split query is loading", () => {
    useSplitRecommendationMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: refetchMock,
    } as any);

    renderScreen();

    expect(screen.getByText("Loading your split...")).toBeTruthy();
  });

  // ── Error state ────────────────────────────────────────────────────────

  it("shows error message and retry button when split query fails", () => {
    useSplitRecommendationMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchMock,
    } as any);

    renderScreen();

    expect(screen.getByText("Unable to load split recommendation.")).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("calls refetch when Retry is pressed", async () => {
    useSplitRecommendationMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchMock,
    } as any);

    renderScreen();

    fireEvent.click(screen.getByText("Retry"));
    expect(refetchMock).toHaveBeenCalledOnce();
  });

  // ── Happy path render ──────────────────────────────────────────────────

  it("renders split chips for each day in recommendation", () => {
    renderScreen();

    expect(screen.getByText("Your training split")).toBeTruthy();
    // 3 days → 3 chips labelled Day 1/2/3
    expect(screen.getByText("Day 1")).toBeTruthy();
    expect(screen.getByText("Day 2")).toBeTruthy();
    expect(screen.getByText("Day 3")).toBeTruthy();
    // All are full_body
    expect(screen.getAllByText("Full Body").length).toBe(3);
  });

  it("does not show reset link when recommendation matches current focuses", () => {
    renderScreen();
    expect(screen.queryByText("Reset to recommended")).toBeNull();
  });

  it("does not show balance warning for 3 full_body days", () => {
    renderScreen();
    expect(screen.queryByText(/fatigue|balance/i)).toBeNull();
  });

  it("shows balance warning for all-upper days", () => {
    useSplitRecommendationMock.mockReturnValue({
      data: {
        ...defaultSplitData,
        recommendation: ["upper_body", "upper_body", "upper_body"],
      },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    } as any);

    renderScreen();

    expect(screen.getByText(/mix.*full body|full body.*balance/i)).toBeTruthy();
  });

  // ── Reset to recommended ───────────────────────────────────────────────

  it("shows reset link and clicking it restores recommendation", async () => {
    renderScreen();

    // Open picker for Day 1 and select lower_body
    fireEvent.click(screen.getByTestId("split-day-chip-0"));
    fireEvent.click(screen.getByText("Pick lower_body"));

    // Reset link should appear
    await waitFor(() => {
      expect(screen.getByText("Reset to recommended")).toBeTruthy();
    });

    // Click reset
    fireEvent.click(screen.getByText("Reset to recommended"));

    // Reset link should disappear
    await waitFor(() => {
      expect(screen.queryByText("Reset to recommended")).toBeNull();
    });
  });

  // ── Continue / navigation ──────────────────────────────────────────────

  it("patches profile and navigates to ProgramReview on Continue (normal onboarding)", async () => {
    renderScreen();

    fireEvent.click(screen.getByTestId("split-continue-button"));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledOnce();
      expect(navigateMock).toHaveBeenCalledWith("ProgramReview");
    });
  });

  it("patches profile and program split then calls popToTop on fromRecalibrate", async () => {
    renderScreen({ fromRecalibrate: true, programId: "prog-123" });

    fireEvent.click(screen.getByTestId("split-continue-button"));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledOnce();
      expect(authenticatedFetchMock).toHaveBeenCalledWith(
        "/api/programs/prog-123/split",
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(popToTopMock).toHaveBeenCalledOnce();
    });
  });

  it("still navigates even when profile patch fails", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("network error"));

    renderScreen();

    fireEvent.click(screen.getByTestId("split-continue-button"));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("ProgramReview");
    });
  });

  // ── Existing preference ────────────────────────────────────────────────

  it("initializes from existingPreference when set", () => {
    useSplitRecommendationMock.mockReturnValue({
      data: {
        ...defaultSplitData,
        existingPreference: ["upper_body", "lower_body", "upper_body"],
        existingModifiedByUser: true,
      },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    } as any);

    renderScreen();

    // Should show the existing preference chips, not the recommendation
    expect(screen.getAllByText("Upper Body").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Lower Body")).toBeTruthy();
    // Modified from recommendation → reset link visible
    expect(screen.getByText("Reset to recommended")).toBeTruthy();
  });
});
