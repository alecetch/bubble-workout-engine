import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingEntry } from "./OnboardingEntry";
import {
  useClientProfile,
  useCreateClientProfile,
  useLinkClientProfileToUser,
  useMe,
  useReferenceData,
} from "../../api/hooks";
import { getOnboardingDraft, useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { DEFAULT_ONBOARDING_DRAFT } from "../../state/onboarding/types";

vi.mock("../../api/hooks", () => ({
  useMe: vi.fn(),
  useClientProfile: vi.fn(),
  useReferenceData: vi.fn(),
  useCreateClientProfile: vi.fn(),
  useLinkClientProfileToUser: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  getApiDiagnostics: vi.fn(() => ({
    lastAttemptedUrl: "http://localhost/me",
    lastErrorMessage: "network failed",
  })),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
  }) => <button onClick={onPress}>{children}</button>,
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  getOnboardingDraft: vi.fn(),
  useOnboardingStore: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      setQueryData: vi.fn(),
    })),
  };
});

const useMeMock = vi.mocked(useMe);
const useClientProfileMock = vi.mocked(useClientProfile);
const useReferenceDataMock = vi.mocked(useReferenceData);
const useCreateClientProfileMock = vi.mocked(useCreateClientProfile);
const useLinkClientProfileToUserMock = vi.mocked(useLinkClientProfileToUser);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);
const getOnboardingDraftMock = vi.mocked(getOnboardingDraft);

const resetFromProfileMock = vi.fn();
const setIdentityMock = vi.fn();
const createMutateMock = vi.fn();
const linkMutateMock = vi.fn();

const completeProfile = {
  id: "profile-1",
  goals: ["Strength"],
  fitnessLevel: "Intermediate",
  injuryFlags: ["No known issues"],
  equipmentPresetCode: "commercial_gym",
  selectedEquipmentCodes: ["barbell"],
  preferredDays: ["Mon", "Wed"],
  minutesPerSession: 50,
  heightCm: 180,
  weightKg: 82,
  sex: "Male",
  ageRange: "25-34",
  onboardingStepCompleted: 3,
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};

const completeDraft = {
  ...DEFAULT_ONBOARDING_DRAFT,
  ...completeProfile,
  anchorLiftsSkipped: true,
};

function renderScreen() {
  const navigation = { replace: vi.fn(), navigate: vi.fn() };
  render(<OnboardingEntry navigation={navigation as any} route={{} as any} />);
  return navigation;
}

describe("OnboardingEntry", () => {
  beforeEach(() => {
    resetFromProfileMock.mockReset();
    setIdentityMock.mockReset();
    createMutateMock.mockReset();
    linkMutateMock.mockReset();

    useOnboardingStoreMock.mockImplementation((selector: any) =>
      selector({ resetFromProfile: resetFromProfileMock, setIdentity: setIdentityMock }),
    );
    getOnboardingDraftMock.mockReturnValue(completeDraft as any);
    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as any);
    useReferenceDataMock.mockReturnValue({
      data: { injuryFlags: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as any);
    useClientProfileMock.mockReturnValue({
      data: completeProfile,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as any);
    createMutateMock.mockResolvedValue({ id: "profile-new" });
    linkMutateMock.mockResolvedValue({ id: "user-1", clientProfileId: "profile-new" });
    useCreateClientProfileMock.mockReturnValue({ mutateAsync: createMutateMock, isPending: false } as any);
    useLinkClientProfileToUserMock.mockReturnValue({ mutateAsync: linkMutateMock, isPending: false } as any);
  });

  it("shows loading while me query is in flight", () => {
    useMeMock.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false } as any);

    renderScreen();

    expect(screen.getByText("Preparing onboarding...")).toBeInTheDocument();
  });

  it("shows error state with Retry", () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    useMeMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: { message: "me failed" },
      refetch,
    } as any);

    renderScreen();

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("routes completed user directly to ProgramReview", async () => {
    const navigation = renderScreen();

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("ProgramReview");
    });
  });

  it("routes partially-onboarded user to their next incomplete step", async () => {
    const profile = { ...completeProfile, onboardingStepCompleted: 1, onboardingCompletedAt: null };
    useClientProfileMock.mockReturnValueOnce({
      data: profile,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    getOnboardingDraftMock.mockReturnValueOnce({
      ...DEFAULT_ONBOARDING_DRAFT,
      goals: ["Strength"],
      fitnessLevel: "Intermediate",
      injuryFlags: ["No known issues"],
      equipmentPresetCode: null,
      equipmentPreset: null,
      selectedEquipmentCodes: [],
      equipmentItemCodes: [],
      preferredDays: [],
      minutesPerSession: null,
      heightCm: null,
      weightKg: null,
      sex: null,
      ageRange: null,
      onboardingStepCompleted: 1,
    } as any);

    const navigation = renderScreen();

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("Step2Equipment");
    });
  });

  it("creates and links profile for a brand-new user", async () => {
    useMeMock.mockReturnValueOnce({
      data: { id: "user-1", clientProfileId: null },
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as any);
    useClientProfileMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderScreen();

    await waitFor(() => {
      expect(createMutateMock).toHaveBeenCalledWith({});
      expect(linkMutateMock).toHaveBeenCalledWith({ clientProfileId: "profile-new" });
    });
  });

  it("calls resetFromProfile when hydrating existing profile", async () => {
    renderScreen();

    await waitFor(() => {
      expect(resetFromProfileMock).toHaveBeenCalledWith(completeProfile);
    });
  });
});
