import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { reportError } from "../../lib/crashReporting";
import { restoreSession } from "./restoreSession";
import { ApiError } from "../../api/client";
import { clearTokens, getAccessToken } from "../../api/tokenStorage";
import { getMe } from "../../api/me";
import { getClientProfile } from "../../api/clientProfiles";
import { getEntitlement } from "../../api/entitlement";
import { useSessionStore } from "./sessionStore";
import { queryClient } from "../../api/queryClient";
vi.mock("../../lib/crashReporting", () => ({ reportError: vi.fn() }));
vi.mock("../../api/config", () => ({ API_BASE_URL: "http://localhost:3000" }));
vi.mock("../../api/tokenStorage", () => ({ getAccessToken: vi.fn(), clearTokens: vi.fn() }));
vi.mock("../../api/me", () => ({ getMe: vi.fn() }));
vi.mock("../../api/clientProfiles", () => ({ getClientProfile: vi.fn() }));
vi.mock("../../api/entitlement", () => ({ getEntitlement: vi.fn() }));
vi.mock("../../lib/purchases", () => ({ logInPurchases: vi.fn() }));
vi.mock("../onboarding/onboardingStore", () => ({ useOnboardingStore: { getState: () => ({ resetFromProfile: vi.fn(), setIdentity: vi.fn() }) } }));
beforeEach(() => {
  vi.resetAllMocks();
  useSessionStore.getState().clearSession();
  queryClient.clear();
  vi.mocked(getAccessToken).mockResolvedValue("saved-token");
  vi.mocked(getMe).mockResolvedValue({ id: "user", clientProfileId: "profile" });
  vi.mocked(getClientProfile).mockResolvedValue({ id: "profile", userId: "user", onboardingStepCompleted: 3 } as any);
  vi.mocked(getEntitlement).mockResolvedValue({ subscription_status: "active", trial_expires_at: null } as any);
});
it("restores server-verified identity, onboarding route and entitlement", async () => {
  await expect(restoreSession()).resolves.toBe("restored");
  expect(useSessionStore.getState()).toMatchObject({ isAuthenticated: true, userId: "user", clientProfileId: "profile", entryRoute: "ProgramReview", initialTab: "TodayTab", subscriptionStatus: "active" });
  expect(queryClient.getQueryData(["me"])).toEqual({ id: "user", clientProfileId: "profile" });
});
it("does not call the API on a clean install", async () => {
  vi.mocked(getAccessToken).mockResolvedValue(null);
  await expect(restoreSession()).resolves.toBe("signed_out");
  expect(getMe).not.toHaveBeenCalled();
});
it.each([getMe, getClientProfile, getEntitlement])("returns unreachable without clearing credentials on an API failure", async endpoint => {
  const setSession = vi.spyOn(useSessionStore.getState(), "setSession");
  vi.mocked(endpoint).mockRejectedValueOnce(new TypeError("network unavailable"));
  await expect(restoreSession()).resolves.toBe("unreachable");
  expect(clearTokens).not.toHaveBeenCalled();
  expect(setSession).not.toHaveBeenCalled();
  expect(useSessionStore.getState().isAuthenticated).toBe(false);
  expect(queryClient.getQueryData(["me"])).toBeUndefined();
  setSession.mockRestore();
});
it("returns signed_out for an explicit session-expired error", async () => {
  vi.mocked(getMe).mockRejectedValueOnce(new ApiError(401, "Session expired", { code: "session_expired" }));
  await expect(restoreSession()).resolves.toBe("signed_out");
  expect(clearTokens).not.toHaveBeenCalled(); // API client owns invalidation.
});
it("resumes incomplete onboarding without generating a profile", async () => {
  vi.mocked(getClientProfile).mockResolvedValue({ id: "profile", onboardingStepCompleted: 1 } as any);
  await restoreSession();
  expect(useSessionStore.getState()).toMatchObject({ entryRoute: "OnboardingEntry", initialTab: "HomeTab" });
});
it("does not invent a profile when none is linked", async () => {
  vi.mocked(getMe).mockResolvedValue({ id: "user", clientProfileId: null });
  await restoreSession();
  expect(getClientProfile).not.toHaveBeenCalled();
  expect(useSessionStore.getState().isAuthenticated).toBe(false);
});
it("does not mutate session after unmount", async () => {
  await restoreSession(() => false);
  expect(useSessionStore.getState().isAuthenticated).toBe(false);
  expect(queryClient.getQueryData(["me"])).toBeUndefined();
});
it("does not overwrite an existing sign-in", async () => {
  useSessionStore.getState().setSession({ userId: "new-user", clientProfileId: "new-profile", entryRoute: "ProgramReview", initialTab: "TodayTab" });
  await restoreSession();
  expect(useSessionStore.getState().userId).toBe("new-user");
});

it.each([
  { onboardingCompletedAt: "2026-11-14", onboardingStepCompleted: 0 },
  { onboardingCompletedAt: null, onboardingStepCompleted: 3 },
  { onboardingCompletedAt: null, onboardingStepCompleted: 4 },
])("restores Today from either onboarding completion signal (%j)", async completion => {
  vi.mocked(getClientProfile).mockResolvedValue({ id: "profile", userId: "user", ...completion } as any);
  await restoreSession();
  expect(useSessionStore.getState()).toMatchObject({ entryRoute: "ProgramReview", initialTab: "TodayTab" });
  expect(getMe).toHaveBeenCalledTimes(1);
  expect(getClientProfile).toHaveBeenCalledTimes(1);
  expect(getEntitlement).toHaveBeenCalledTimes(1);
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("treats an unreadable saved token as signed out and reports it without a network call", async () => {
  const error = Object.assign(new Error("private native message saved-token"), { code: -34018 });
  vi.mocked(getAccessToken).mockRejectedValueOnce(error);
  await expect(restoreSession()).resolves.toBe("signed_out");
  expect(reportError).toHaveBeenCalledExactlyOnceWith(error, "session.token_read_failed");
  expect(getMe).not.toHaveBeenCalled(); expect(getClientProfile).not.toHaveBeenCalled(); expect(getEntitlement).not.toHaveBeenCalled();
  expect(clearTokens).not.toHaveBeenCalled();
});
it.each([
  ["missing", "signed_out", "token_read"],
  ["token_failure", "signed_out", "token_read"],
  ["network_failure", "unreachable", "network"],
  ["expired", "signed_out", "network"],
  ["success", "restored", "network"],
])("smoke trace emits one safe outcome line for %s", async (scenario, expected, stage) => {
  vi.stubEnv("EXPO_PUBLIC_SMOKE_DIAGNOSTICS", "true");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = Object.assign(new TypeError("private native message saved-token user@example.test"), { code: -34018 });
  if (scenario === "missing") vi.mocked(getAccessToken).mockResolvedValueOnce(null);
  if (scenario === "token_failure") vi.mocked(getAccessToken).mockRejectedValueOnce(error);
  if (scenario === "network_failure") vi.mocked(getMe).mockRejectedValueOnce(error);
  if (scenario === "expired") vi.mocked(getMe).mockRejectedValueOnce(new ApiError(401, "private native message", { code: "session_expired" }));
  await expect(restoreSession()).resolves.toBe(expected);
  expect(warn).toHaveBeenCalledTimes(1);
  const text = String(warn.mock.calls[0][0]);
  expect(text).toContain(`outcome=${expected} stage=${stage} error=`);
  if (scenario.endsWith("failure")) { expect(text).toContain("error=TypeError"); expect(text).toContain("code=-34018"); }
  for (const secret of ["private native message", "saved-token", "user@example.test"]) expect(text).not.toContain(secret);
});
it("real builds emit no smoke trace for token or network errors", async () => {
  vi.stubEnv("EXPO_PUBLIC_SMOKE_DIAGNOSTICS", undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(getAccessToken).mockRejectedValueOnce(new Error("private")); await restoreSession();
  vi.mocked(getMe).mockRejectedValueOnce(new TypeError("network")); await restoreSession();
  expect(warn).not.toHaveBeenCalled();
});
