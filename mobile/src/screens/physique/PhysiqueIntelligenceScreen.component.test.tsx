import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as ImagePicker from "expo-image-picker";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEntitlement, usePhysiqueScans } from "../../api/hooks";
import { ApiError } from "../../api/client";
import { recordConsent } from "../../api/physique";
import { submitScan } from "../../api/physiqueScan";
import { captureAndShare } from "../../components/physique/PhysiqueShareCard";
import { PhysiqueIntelligenceScreen } from "./PhysiqueIntelligenceScreen";

vi.mock("../../api/hooks", () => ({
  useEntitlement: vi.fn(),
  usePhysiqueScans: vi.fn(),
}));

vi.mock("../../api/physiqueScan", () => ({
  submitScan: vi.fn(),
}));

vi.mock("../../api/physique", () => ({
  recordConsent: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    details: unknown;

    constructor(status: number, message: string, details?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = details;
    }
  },
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  MediaTypeOptions: { Images: "images" },
  UIImagePickerControllerQualityType: {},
}));

vi.mock("../../components/physique/PhysiqueShareCard", () => ({
  captureAndShare: vi.fn().mockResolvedValue(undefined),
  PhysiqueShareCard: () => null,
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const SCAN_RESULT_FIXTURE = {
  ok: true,
  scan_id: "scan-001",
  submitted_at: "2026-05-06T10:00:00Z",
  physique_score: 74.0,
  score_delta: 2.5,
  region_scores: {},
  body_composition: {
    leanness_rating: 7.5,
    muscle_fullness_rating: 7.0,
    symmetry_rating: 8.0,
    dominant_strength: "upper_body",
    development_stage: "intermediate",
  },
  observations: ["Good upper body definition"],
  comparison: null,
  milestones_achieved: [],
  ai_coaching_narrative: "Strong progress",
  streak: 3,
};

const mockRefetch = vi.fn();
const useEntitlementMock = vi.mocked(useEntitlement);
const usePhysiqueScansMock = vi.mocked(usePhysiqueScans);
const launchImageLibraryAsyncMock = vi.mocked(ImagePicker.launchImageLibraryAsync);
const launchCameraAsyncMock = vi.mocked(ImagePicker.launchCameraAsync);
const submitScanMock = vi.mocked(submitScan);
const recordConsentMock = vi.mocked(recordConsent);
const captureAndShareMock = vi.mocked(captureAndShare);

function renderScreen() {
  const mockParentNavigate = vi.fn();
  const nav = {
    navigate: vi.fn(),
    goBack: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    reset: vi.fn(),
    setOptions: vi.fn(),
    canGoBack: vi.fn(() => true),
    dispatch: vi.fn(),
    getParent: vi.fn().mockReturnValue({ navigate: mockParentNavigate }),
  };

  render(<PhysiqueIntelligenceScreen navigation={nav as any} route={{} as any} />);
  return { nav, mockParentNavigate };
}

async function advanceToPreview() {
  launchImageLibraryAsyncMock.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///tmp/photo.jpg" }],
  } as any);

  renderScreen();
  fireEvent.click(screen.getByText("Choose from library"));
  await screen.findByText("Analyse");
}

describe("PhysiqueIntelligenceScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefetch.mockReset().mockResolvedValue(undefined);

    useEntitlementMock.mockReturnValue({
      data: { subscription_status: "active" },
      isSuccess: true,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    usePhysiqueScansMock.mockReturnValue({
      data: { scans: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);
    launchImageLibraryAsyncMock.mockResolvedValue({ canceled: true } as any);
    launchCameraAsyncMock.mockResolvedValue({ canceled: true } as any);
    submitScanMock.mockResolvedValue(SCAN_RESULT_FIXTURE as any);
  });

  it("renders picker phase initially with camera and library buttons", () => {
    renderScreen();

    expect(screen.getByRole("button", { name: "Take photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose from library" })).toBeInTheDocument();
    expect(screen.queryByText("Analyse")).not.toBeInTheDocument();
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("library picker returning an image transitions to preview phase", async () => {
    launchImageLibraryAsyncMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/photo.jpg" }],
    } as any);

    renderScreen();
    fireEvent.click(screen.getByText("Choose from library"));

    expect(await screen.findByText("Analyse")).toBeInTheDocument();
    expect(screen.getByText("Choose a different photo")).toBeInTheDocument();
    expect(screen.queryByText("Take photo")).not.toBeInTheDocument();
  });

  it("library picker returning cancelled stays in picker phase", async () => {
    renderScreen();

    fireEvent.click(screen.getByText("Choose from library"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Take photo")).toBeInTheDocument();
  });

  it("Analyse button transitions to uploading phase with activity indicator", async () => {
    submitScanMock.mockImplementation(() => new Promise(() => {}));

    await advanceToPreview();
    fireEvent.click(screen.getByText("Analyse"));

    expect(await screen.findByText("Analysing your physique...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("Analyse")).not.toBeInTheDocument();
  });

  it("successful submitScan transitions to result phase with score", async () => {
    await advanceToPreview();
    fireEvent.click(screen.getByText("Analyse"));

    expect(await screen.findByText("74.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share progress" })).toBeInTheDocument();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("422 response from submitScan transitions to low_quality phase", async () => {
    submitScanMock.mockRejectedValue(new ApiError(422, "low quality"));

    await advanceToPreview();
    fireEvent.click(screen.getByText("Analyse"));

    expect(await screen.findByText("Photo not usable")).toBeInTheDocument();
    expect(screen.getByText("Try a different photo")).toBeInTheDocument();
  });

  it("pressing Try a different photo in low_quality returns to picker phase", async () => {
    submitScanMock.mockRejectedValue(new ApiError(422, "low quality"));

    await advanceToPreview();
    fireEvent.click(screen.getByText("Analyse"));
    await screen.findByText("Photo not usable");
    fireEvent.click(screen.getByText("Try a different photo"));

    expect(screen.getByText("Take photo")).toBeInTheDocument();
    expect(screen.queryByText("Photo not usable")).not.toBeInTheDocument();
  });

  it("generic error from submitScan transitions to error phase", async () => {
    submitScanMock.mockRejectedValue(new Error("Network error"));

    await advanceToPreview();
    fireEvent.click(screen.getByText("Analyse"));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("402 response from submitScan transitions to upgrade phase", async () => {
    const { mockParentNavigate } = renderScreen();
    launchImageLibraryAsyncMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/photo.jpg" }],
    } as any);
    submitScanMock.mockRejectedValue(new ApiError(402, "payment required"));

    fireEvent.click(screen.getByText("Choose from library"));
    await screen.findByText("Analyse");
    fireEvent.click(screen.getByText("Analyse"));

    expect(await screen.findByText("Upgrade to Premium")).toBeInTheDocument();
    expect(mockParentNavigate).not.toHaveBeenCalled();
  });

  it("Share progress button in result phase calls captureAndShare", async () => {
    await advanceToPreview();
    fireEvent.click(screen.getByText("Analyse"));
    await screen.findByText("74.0");

    fireEvent.click(screen.getByText("Share progress"));

    await waitFor(() => expect(captureAndShareMock).toHaveBeenCalledOnce());
  });
});
