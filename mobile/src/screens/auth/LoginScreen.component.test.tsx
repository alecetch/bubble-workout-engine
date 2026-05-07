import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen";
import { apiLogin } from "../../api/authApi";
import { ApiError } from "../../api/client";
import { createClientProfile, getClientProfile } from "../../api/clientProfiles";
import { saveTokens } from "../../api/tokenStorage";
import { logInPurchases } from "../../lib/purchases";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { buildClientProfile, buildToken, mockZustandSelector } from "../../__test-utils__";

vi.mock("../../api/authApi", () => ({
  apiLogin: vi.fn(),
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

const apiLoginMock = vi.mocked(apiLogin);
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
  onboardingStepCompleted: 1,
  onboardingCompletedAt: null,
});

function renderScreen() {
  const navigation = { navigate: vi.fn(), goBack: vi.fn(), replace: vi.fn() };
  render(<LoginScreen navigation={navigation as any} route={{ params: {} } as any} />);
  return navigation;
}

function fillCredentials(email = " User@Example.COM ", password = "password123"): void {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText("Enter password"), { target: { value: password } });
}

describe("LoginScreen", () => {
  beforeEach(() => {
    apiLoginMock.mockReset();
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
    apiLoginMock.mockResolvedValue(tokens);
    getClientProfileMock.mockResolvedValue(completeProfile as any);
    createClientProfileMock.mockResolvedValue(partialProfile as any);
    saveTokensMock.mockResolvedValue(undefined);
  });

  it("renders email and password inputs and a login button", () => {
    renderScreen();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("does not call apiLogin when fields are empty", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(apiLoginMock).not.toHaveBeenCalled();
  });

  it("calls apiLogin with the normalized email and password", async () => {
    renderScreen();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(apiLoginMock).toHaveBeenCalledWith("user@example.com", "password123"));
  });

  it("shows a disabled loading state while the request is in flight", async () => {
    apiLoginMock.mockReturnValue(new Promise(() => {}) as any);
    renderScreen();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: "Signing in..." })).toBeDisabled();
  });

  it("sets the ProgramReview entry route for an onboarded user", async () => {
    renderScreen();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(setSessionMock).toHaveBeenCalledWith(expect.objectContaining({ entryRoute: "ProgramReview" })),
    );
    expect(saveTokensMock).toHaveBeenCalledWith("access-token", "refresh-token");
    expect(resetFromProfileMock).toHaveBeenCalledWith(completeProfile);
    expect(setIdentityMock).toHaveBeenCalledWith({ userId: "user-1", clientProfileId: "profile-1" });
    expect(logInPurchasesMock).toHaveBeenCalledWith("user-1");
  });

  it("creates a profile and sets the OnboardingEntry route when the profile is missing", async () => {
    getClientProfileMock.mockRejectedValueOnce(new Error("not found"));
    createClientProfileMock.mockResolvedValueOnce(partialProfile as any);
    renderScreen();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(setSessionMock).toHaveBeenCalledWith(expect.objectContaining({ entryRoute: "OnboardingEntry" })),
    );
    expect(createClientProfileMock).toHaveBeenCalledWith({});
  });

  it("shows a credential error for 401 responses", async () => {
    apiLoginMock.mockRejectedValueOnce(new ApiError(401, "invalid credentials"));
    renderScreen();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });

  it("shows a user-readable network error on connectivity failure", async () => {
    apiLoginMock.mockRejectedValueOnce(new Error("Network request failed"));
    renderScreen();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeInTheDocument();
  });

  it("navigates to Register from the account creation link", () => {
    const navigation = renderScreen();
    fireEvent.click(screen.getByText("Don't have an account? Create one"));
    expect(navigation.navigate).toHaveBeenCalledWith("Register");
  });
});
