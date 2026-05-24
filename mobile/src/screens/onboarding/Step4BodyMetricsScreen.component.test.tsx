import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ImagePicker from "expo-image-picker";
import { Step4BodyMetricsScreen } from "./Step4BodyMetricsScreen";
import { useMe, useUpdateClientProfile } from "../../api/hooks";
import { submitCheckIn } from "../../api/physique";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { buildOnboardingDraft, buildOnboardingStoreState, mockZustandSelector } from "../../__test-utils__";

vi.mock("../../api/hooks", () => ({
  useMe: vi.fn(),
  useUpdateClientProfile: vi.fn(),
}));

vi.mock("../../api/physique", () => ({
  submitCheckIn: vi.fn().mockResolvedValue({
    ok: true,
    check_in_id: "c1",
    submitted_at: "2026-05-23T00:00:00Z",
    analysis: null,
  }),
  recordConsent: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../utils/pendingPhysiqueUpload", () => ({
  setPendingPhysiqueUpload: vi.fn(),
  clearPendingPhysiqueUpload: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchCameraAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
  requestCameraPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  MediaTypeOptions: { Images: "Images" },
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../components/interaction/haptics", () => ({
  hapticHeavy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../components/onboarding/OnboardingScaffold", () => ({
  OnboardingScaffold: ({ children, onBack, onNext, nextLabel, nextDisabled }: any) => (
    <div>
      {children}
      <button type="button" onClick={onBack}>Back</button>
      <button type="button" disabled={nextDisabled} onClick={onNext}>{nextLabel}</button>
    </div>
  ),
}));

vi.mock("../../components/onboarding/SectionCard", () => ({
  SectionCard: ({ title, children }: any) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock("../../components/onboarding/NumericField", () => ({
  NumericField: ({ label, testID, value, onChangeText }: any) => (
    <label>
      {label}
      <input data-testid={testID} value={value} onChange={(event) => onChangeText(event.currentTarget.value)} />
    </label>
  ),
}));

const useMeMock = vi.mocked(useMe);
const useUpdateClientProfileMock = vi.mocked(useUpdateClientProfile);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);
const submitCheckInMock = vi.mocked(submitCheckIn);
const launchImageLibraryAsyncMock = vi.mocked(ImagePicker.launchImageLibraryAsync);

const updateProfileMutateAsyncMock = vi.fn();
const setDraftMock = vi.fn();
const setFieldErrorsMock = vi.fn();
const setIsSavingMock = vi.fn();

function mockStore(overrides = {}) {
  const state = buildOnboardingStoreState(
    buildOnboardingDraft({
      preferredDays: ["Mon", "Wed"],
      heightCm: 175,
      weightKg: 72.5,
      preferredUnit: "kg",
      ...overrides,
    }),
    {
      setDraft: setDraftMock,
      setFieldErrors: setFieldErrorsMock,
      setIsSaving: setIsSavingMock,
    } as any,
  );
  mockZustandSelector(useOnboardingStoreMock as any, state);
}

function renderScreen() {
  const navigation = { navigate: vi.fn(), replace: vi.fn() };
  render(<Step4BodyMetricsScreen navigation={navigation as any} route={{} as any} />);
  return navigation;
}

describe("Step4BodyMetricsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
    } as any);
    updateProfileMutateAsyncMock.mockResolvedValue({});
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: updateProfileMutateAsyncMock,
    } as any);
    mockStore();
  });

  it("renders height and weight fields in metric mode", () => {
    renderScreen();
    expect(screen.getByTestId("height-cm-input")).toBeInTheDocument();
    expect(screen.getByTestId("weight-kg-input")).toBeInTheDocument();
  });

  it("unit toggle switches to ft/in fields", () => {
    renderScreen();
    fireEvent.click(screen.getByText("Imperial (ft, in / lbs)"));
    expect(screen.getByTestId("height-ft-input")).toBeInTheDocument();
    expect(screen.getByTestId("height-in-input")).toBeInTheDocument();
    expect(screen.queryByTestId("height-cm-input")).not.toBeInTheDocument();
  });

  it("imperial inputs convert to cm/kg when Finish is called", async () => {
    mockStore({ preferredUnit: "lbs", heightCm: null, weightKg: null });
    renderScreen();
    fireEvent.change(screen.getByTestId("height-ft-input"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("height-in-input"), { target: { value: "11" } });
    fireEvent.change(screen.getByTestId("weight-lbs-input"), { target: { value: "160" } });
    fireEvent.click(screen.getByText("Finish"));

    await waitFor(() => {
      expect(updateProfileMutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
        heightCm: 180,
        weightKg: 72.6,
        preferredUnit: "lbs",
        onboardingStepCompleted: 4,
      }));
    });
  });

  it("metric mode Finish calls updateClientProfile with cm/kg directly", async () => {
    renderScreen();
    fireEvent.change(screen.getByTestId("height-cm-input"), { target: { value: "175" } });
    fireEvent.change(screen.getByTestId("weight-kg-input"), { target: { value: "72.5" } });
    fireEvent.click(screen.getByText("Finish"));

    await waitFor(() => {
      expect(updateProfileMutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
        heightCm: 175,
        weightKg: 72.5,
        preferredUnit: "kg",
      }));
    });
  });

  it("Finish without photo does not call submitCheckIn", async () => {
    renderScreen();
    fireEvent.click(screen.getByText("Finish"));
    await waitFor(() => expect(updateProfileMutateAsyncMock).toHaveBeenCalled());
    expect(submitCheckInMock).not.toHaveBeenCalled();
  });

  it("photo thumbnail is shown after image selection from library", async () => {
    launchImageLibraryAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///start.jpg" }],
    } as any);
    renderScreen();
    fireEvent.click(screen.getByText("Library"));
    expect(await screen.findByTestId("starting-photo-preview")).toBeInTheDocument();
  });

  it("navigates to SplitReview on successful Finish", async () => {
    const navigation = renderScreen();
    fireEvent.click(screen.getByText("Finish"));
    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith("SplitReview", { daysPerWeek: 2 });
    });
  });
});
