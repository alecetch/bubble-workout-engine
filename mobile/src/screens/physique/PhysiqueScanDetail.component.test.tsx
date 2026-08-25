import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeleteScan } from "../../api/hooks";
import { getScan } from "../../api/physiqueScan";
import { PhysiqueScanDetailScreen } from "./PhysiqueScanDetail";

vi.mock("../../api/hooks", () => ({
  useDeleteScan: vi.fn(),
}));

vi.mock("../../api/physiqueScan", () => ({
  getScan: vi.fn(),
}));

const SCAN_DETAIL = {
  id: "scan-abc",
  submitted_at: "2026-04-01T10:00:00Z",
  physique_score: 72,
  score_delta: null,
  photo_url: null,
  region_scores: {
    chest: { score: 6.8, descriptor: "Good", confidence: "high" },
  },
  body_composition: {
    leanness_rating: 7,
    muscle_fullness_rating: 6,
    symmetry_rating: 8,
    dominant_strength: "upper_body",
    development_stage: "intermediate",
  },
  observations: ["Solid upper body development"],
  comparison: null,
  milestones_achieved: [],
  ai_coaching_narrative: "Great progress this month",
  streak: 3,
  emphasis_weights: {},
};

const useQueryMock = vi.mocked(useQuery);
const useDeleteScanMock = vi.mocked(useDeleteScan);
const getScanMock = vi.mocked(getScan);
const deleteScanMutateMock = vi.fn();
const alertSpy = vi.spyOn(Alert, "alert").mockImplementation(() => {});

function makeNav() {
  return { goBack: vi.fn(), navigate: vi.fn() };
}

function renderScreen(nav = makeNav()) {
  render(
    <PhysiqueScanDetailScreen
      route={{ params: { scanId: "scan-abc" } } as any}
      navigation={nav as any}
    />,
  );
  return nav;
}

describe("PhysiqueScanDetailScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getScanMock.mockResolvedValue({ ok: true, scan: SCAN_DETAIL } as any);
    useQueryMock.mockReturnValue({
      data: { ok: true, scan: SCAN_DETAIL },
      isLoading: false,
      error: null,
    } as any);
    useDeleteScanMock.mockReturnValue({
      mutate: deleteScanMutateMock,
      isPending: false,
    } as any);
  });
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("shows loading indicator when scan is loading", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    renderScreen();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("Scan detail")).not.toBeInTheDocument();
  });

  it("shows premium gate when error has code premium_required", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { code: "premium_required" },
    } as any);

    renderScreen();

    expect(screen.getByText("Premium is required to view detailed physique scan results.")).toBeInTheDocument();
    expect(screen.queryByText("72.0")).not.toBeInTheDocument();
  });

  it("shows not-found text when scan resolves to null or undefined", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as any);

    renderScreen();

    expect(screen.getByText("Unable to load this scan.")).toBeInTheDocument();
  });

  it("renders score, coaching narrative, and region label when scan data is present", () => {
    renderScreen();

    expect(screen.getByText("72.0")).toBeInTheDocument();
    expect(screen.getByText("Great progress this month")).toBeInTheDocument();
    expect(screen.getByText("Chest")).toBeInTheDocument();
    expect(screen.getByText("AI coaching")).toBeInTheDocument();
  });

  it("renders a delete action", () => {
    renderScreen();

    expect(screen.getByRole("button", { name: "Delete scan" })).toBeInTheDocument();
  });

  it("confirms and deletes the scan, then navigates back on success", () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Delete scan" }));

    expect(alertSpy).toHaveBeenCalledWith(
      "Delete scan?",
      "This removes the photo and analysis. This cannot be undone.",
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel", style: "cancel" }),
        expect.objectContaining({ text: "Delete", style: "destructive" }),
      ]),
    );

    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    buttons.find((button) => button.text === "Delete")?.onPress?.();

    expect(deleteScanMutateMock).toHaveBeenCalledWith(
      "scan-abc",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    const mutateOptions = deleteScanMutateMock.mock.calls[0][1] as { onSuccess: () => void };
    mutateOptions.onSuccess();

    expect(navigation.goBack).toHaveBeenCalled();
  });

  it("shows an error alert and stays on the screen when delete fails", () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Delete scan" }));
    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    buttons.find((button) => button.text === "Delete")?.onPress?.();

    const mutateOptions = deleteScanMutateMock.mock.calls[0][1] as { onError: () => void };
    mutateOptions.onError();

    expect(alertSpy).toHaveBeenCalledWith("Error", "Could not delete this scan. Please try again.");
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
