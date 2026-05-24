import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as ImagePicker from "expo-image-picker";
import { useEntitlement, usePhysiqueCheckIns } from "../../api/hooks";
import { recordConsent, submitCheckIn, triggerAnalysis } from "../../api/physique";
import { PhysiqueCheckInScreen } from "./PhysiqueCheckInScreen";

vi.mock("../../api/hooks", () => ({
  useEntitlement: vi.fn(),
  usePhysiqueCheckIns: vi.fn(),
}));

vi.mock("../../api/physique", () => ({
  recordConsent: vi.fn().mockResolvedValue({ ok: true }),
  submitCheckIn: vi.fn(),
  triggerAnalysis: vi.fn().mockResolvedValue({ ok: true, analysis: {} }),
}));

vi.mock("../../utils/pendingPhysiqueUpload", () => ({
  getPendingPhysiqueUpload: vi.fn().mockResolvedValue(null),
  clearPendingPhysiqueUpload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchCameraAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
  MediaTypeOptions: { Images: "Images" },
  requestCameraPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted", granted: true }),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const useEntitlementMock = vi.mocked(useEntitlement);
const usePhysiqueCheckInsMock = vi.mocked(usePhysiqueCheckIns);
const launchImageLibraryAsyncMock = vi.mocked(ImagePicker.launchImageLibraryAsync);
const submitCheckInMock = vi.mocked(submitCheckIn);
const triggerAnalysisMock = vi.mocked(triggerAnalysis);
const recordConsentMock = vi.mocked(recordConsent);
const refetchMock = vi.fn();

function mockEntitlement(hasConsented: boolean) {
  useEntitlementMock.mockReturnValue({
    data: {
      physique_consent_given: hasConsented,
      subscription_status: "active",
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as any);
}

function mockCheckIns() {
  refetchMock.mockResolvedValue(undefined);
  usePhysiqueCheckInsMock.mockReturnValue({
    data: { check_ins: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchMock,
  } as any);
}

async function mockCheckInsWith(data: any[]) {
  refetchMock.mockResolvedValue(undefined);
  usePhysiqueCheckInsMock.mockReturnValue({
    data: { check_ins: data },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchMock,
  } as any);
}

async function renderConsentedScreenWithPreview() {
  mockEntitlement(true);
  launchImageLibraryAsyncMock.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///tmp/physique.jpg" }],
  } as any);

  render(<PhysiqueCheckInScreen />);

  fireEvent.click(await screen.findByText("Choose from library"));
  await screen.findByText("Analyse this photo");
}

describe("PhysiqueCheckInScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckIns();
    mockEntitlement(false);
    launchImageLibraryAsyncMock.mockResolvedValue({ canceled: true, assets: [] } as any);
    submitCheckInMock.mockResolvedValue({
      ok: true,
      analysis: {
        observations: ["Improved posture"],
        comparison_notes: "More balanced than last time.",
        emphasis_suggestions: ["upper_back"],
        disclaimer: "AI analysis is informational only.",
      },
    } as any);
  });
  it("has no accessibility violations in the default render state", async () => {
    renderConsentedScreenWithPreview();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("renders the consent screen title and primary CTA", () => {
    render(<PhysiqueCheckInScreen />);

    expect(screen.getByText("Physique Tracking")).toBeInTheDocument();
    expect(screen.getByText("I understand - start tracking")).toBeInTheDocument();
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("shows a loading state while uploading a selected photo", async () => {
    submitCheckInMock.mockImplementation(() => new Promise(() => {}));

    await renderConsentedScreenWithPreview();
    fireEvent.click(screen.getByText("Analyse this photo"));

    expect(await screen.findByText("Analysing your photo...")).toBeInTheDocument();
    expect(screen.getByText("This takes around 10 seconds")).toBeInTheDocument();
  });

  it("shows an error message when upload fails", async () => {
    submitCheckInMock.mockRejectedValue(new Error("Upload failed for test"));

    await renderConsentedScreenWithPreview();
    fireEvent.click(screen.getByText("Analyse this photo"));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Upload failed for test")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("retries a pending onboarding upload on mount", async () => {
    const pending = await import("../../utils/pendingPhysiqueUpload");
    vi.mocked(pending.getPendingPhysiqueUpload).mockResolvedValueOnce("file:///pending.jpg");
    mockEntitlement(true);

    render(<PhysiqueCheckInScreen />);

    await waitFor(() => {
      expect(submitCheckInMock).toHaveBeenCalledWith("file:///pending.jpg", { skipAnalysis: true });
    });
  });

  it("renders starting point check-ins and request analysis button", async () => {
    mockEntitlement(true);
    await mockCheckInsWith([
      {
        id: "check-1",
        submitted_at: "2026-05-23T00:00:00Z",
        photo_url: "https://example.com/photo.jpg",
        analysis: null,
        program_emphasis: [],
      },
    ]);

    render(<PhysiqueCheckInScreen />);

    expect(await screen.findByText("Starting point")).toBeInTheDocument();
    expect(screen.getByText("Request analysis")).toBeInTheDocument();
  });

  it("tapping Request analysis calls triggerAnalysis", async () => {
    mockEntitlement(true);
    await mockCheckInsWith([
      {
        id: "check-1",
        submitted_at: "2026-05-23T00:00:00Z",
        photo_url: "https://example.com/photo.jpg",
        analysis: null,
        program_emphasis: [],
      },
    ]);

    render(<PhysiqueCheckInScreen />);
    fireEvent.click(await screen.findByText("Request analysis"));

    await waitFor(() => {
      expect(triggerAnalysisMock).toHaveBeenCalledWith("check-1");
    });
  });
});
