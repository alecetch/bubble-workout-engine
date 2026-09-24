import { beforeEach, expect, it, vi } from "vitest";
import { restoreSession } from "./restoreSession";
import { getAccessToken } from "../../api/tokenStorage";
import { getMe } from "../../api/me";
import { getClientProfile } from "../../api/clientProfiles";
import { getEntitlement } from "../../api/entitlement";
import { useSessionStore } from "./sessionStore";
import { queryClient } from "../../api/queryClient";
vi.mock("../../api/tokenStorage", () => ({ getAccessToken: vi.fn() }));
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
  await restoreSession();
  expect(useSessionStore.getState()).toMatchObject({ isAuthenticated: true, userId: "user", clientProfileId: "profile", entryRoute: "ProgramReview", subscriptionStatus: "active" });
  expect(queryClient.getQueryData(["me"])).toEqual({ id: "user", clientProfileId: "profile" });
});
it("does not call the API on a clean install", async () => {
  vi.mocked(getAccessToken).mockResolvedValue(null);
  await restoreSession();
  expect(getMe).not.toHaveBeenCalled();
});
it.each(["revoked credentials", "network unavailable"])("does not restore on %s", async message => {
  vi.mocked(getMe).mockRejectedValue(new Error(message));
  await expect(restoreSession()).rejects.toThrow(message);
  expect(useSessionStore.getState().isAuthenticated).toBe(false);
});
it("resumes incomplete onboarding without generating a profile", async () => {
  vi.mocked(getClientProfile).mockResolvedValue({ id: "profile", onboardingStepCompleted: 1 } as any);
  await restoreSession();
  expect(useSessionStore.getState().entryRoute).toBe("OnboardingEntry");
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
  useSessionStore.getState().setSession({ userId: "new-user", clientProfileId: "new-profile", entryRoute: "ProgramReview" });
  await restoreSession();
  expect(useSessionStore.getState().userId).toBe("new-user");
});
