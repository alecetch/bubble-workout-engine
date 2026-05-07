import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterScreen } from "./RegisterScreen";
import { apiRegister } from "../../api/authApi";
import { ApiError } from "../../api/client";
import { createClientProfile, getClientProfile } from "../../api/clientProfiles";
import { saveTokens } from "../../api/tokenStorage";
import { logInPurchases } from "../../lib/purchases";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { buildClientProfile, buildToken, mockZustandSelector } from "../../__test-utils__";

vi.mock("../../api/authApi", () => ({
  apiRegister: vi.fn(),
}));

vi.mock("../../api/clientProfiles", () => ({
  createClientProfile: vi.fn(),
  getClientProfile: vi.fn(),
}));

vi.mock("../../api/tokenStorage", () => ({
  saveTokens: vi.fn(),
}));

vi.mock("../../lib/purchases", () => ({
  logInPurchases: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const apiRegisterMock = vi.mocked(apiRegister);
const getClientProfileMock = vi.mocked(getClientProfile);
const createClientProfileMock = vi.mocked(createClientProfile);
const saveTokensMock = vi.mocked(saveTokens);
const logInPurchasesMock = vi.mocked(logInPurchases);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);
const useSessionStoreMock = vi.mocked(useSessionStore);

const resetFromProfileMock = vi.fn();
const setIdentityMock = vi.fn();
const setSessionMock = vi.fn();

const tokens = buildToken({
  access_token: "access-token",
  refresh_token: "refresh-token",
  user_id: "user-1",
  client_profile_id: "profile-1",
  subscription_status: "trialing",
  trial_expires_at: null,
});

const completeProfile = buildClientProfile({
  id: "profile-1",
  onboardingStepCompleted: 3,
  onboardingCompletedAt: "2026-05-01T12:00:00Z",
});

const partialProfile = buildClientProfile({
  id: "profile-2",
  onboardingStepCompleted: 0,
  onboardingCompletedAt: null,
});

function renderScreen() {
  const navigation = { navigate: vi.fn(), goBack: vi.fn(), replace: vi.fn() };
  render(<RegisterScreen navigation={navigation as any} route={{ params: {} } as any} />);
  return navigation;
}

function fillRegistration(
  email = " User@Example.COM ",
  password = "password123",
  confirmPassword = "password123",
): void {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText("Create password"), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText("Re-enter password"), {
    target: { value: confirmPassword },
  });
}

async function typeText(element: HTMLElement, value: string): Promise<void> {
  let current = "";
  for (const char of value) {
    current += char;
    fireEvent.change(element, { target: { value: current } });
  }
}

describe("RegisterScreen", () => {
  beforeEach(() => {
    apiRegisterMock.mockReset();
    getClientProfileMock.mockReset();
    createClientProfileMock.mockReset();
    saveTokensMock.mockReset();
    logInPurchasesMock.mockReset();
    resetFromProfileMock.mockReset();
    setIdentityMock.mockReset();
    setSessionMock.mockReset();

    mockZustandSelector(useOnboardingStoreMock as any, {
      resetFromProfile: resetFromProfileMock,
      setIdentity: setIdentityMock,
    });
    mockZustandSelector(useSessionStoreMock as any, { setSession: setSessionMock });
    apiRegisterMock.mockResolvedValue(tokens);
    getClientProfileMock.mockResolvedValue(completeProfile as any);
    createClientProfileMock.mockResolvedValue(partialProfile as any);
    saveTokensMock.mockResolvedValue(undefined);
  });

  it("renders email, password, confirm-password inputs, and a register button", () => {
    renderScreen();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Create password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Re-enter password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("does not call apiRegister when fields are empty", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(apiRegisterMock).not.toHaveBeenCalled();
  });

  it("calls apiRegister with email and password", async () => {
    renderScreen();
    fillRegistration();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(apiRegisterMock).toHaveBeenCalledWith("user@example.com", "password123", null),
    );
  });

  it("shows a disabled loading state while the request is in flight", async () => {
    apiRegisterMock.mockReturnValue(new Promise(() => {}) as any);
    renderScreen();
    fillRegistration();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("button", { name: "Creating..." })).toBeDisabled();
  });

  it("sets the OnboardingEntry route when a new user profile must be created", async () => {
    getClientProfileMock.mockRejectedValueOnce(new Error("not found"));
    createClientProfileMock.mockResolvedValueOnce(partialProfile as any);
    renderScreen();
    fillRegistration();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(setSessionMock).toHaveBeenCalledWith(expect.objectContaining({ entryRoute: "OnboardingEntry" })),
    );
    expect(createClientProfileMock).toHaveBeenCalledWith({});
  });

  it("sets the ProgramReview route when an existing profile is onboarded", async () => {
    renderScreen();
    fillRegistration();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(setSessionMock).toHaveBeenCalledWith(expect.objectContaining({ entryRoute: "ProgramReview" })),
    );
    expect(saveTokensMock).toHaveBeenCalledWith("access-token", "refresh-token");
    expect(resetFromProfileMock).toHaveBeenCalledWith(completeProfile);
    expect(setIdentityMock).toHaveBeenCalledWith({ userId: "user-1", clientProfileId: "profile-1" });
    expect(logInPurchasesMock).toHaveBeenCalledWith("user-1");
  });

  it("shows an account-exists error on 409", async () => {
    apiRegisterMock.mockRejectedValueOnce(new ApiError(409, "already exists"));
    renderScreen();
    fillRegistration();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
  });

  it("shows password mismatch before calling the API", async () => {
    renderScreen();
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "user@example.com" },
    });
    await typeText(screen.getByPlaceholderText("Create password"), "password123");
    await typeText(screen.getByPlaceholderText("Re-enter password"), "password124");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(apiRegisterMock).not.toHaveBeenCalled();
  });

  it("navigates to Login from the sign-in link", () => {
    const navigation = renderScreen();
    fireEvent.click(screen.getByText("Already have an account? Sign in"));
    expect(navigation.navigate).toHaveBeenCalledWith("Login");
  });
});
