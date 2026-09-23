import { getAccessToken } from "../../api/tokenStorage";
import { getMe } from "../../api/me";
import { getClientProfile } from "../../api/clientProfiles";
import { getEntitlement } from "../../api/entitlement";
import { queryClient } from "../../api/queryClient";
import { useOnboardingStore } from "../onboarding/onboardingStore";
import { useSessionStore } from "./sessionStore";
import { logInPurchases } from "../../lib/purchases";

// API client refreshes expired access tokens and clears revoked credentials.
// This helper does not clear credentials; the existing API client owns invalidation.
export async function restoreSession(isActive: () => boolean = () => true): Promise<void> {
  if (!await getAccessToken()) return;
  const me = await getMe();
  if (!me.clientProfileId) return;
  const profile = await getClientProfile(me.clientProfileId);
  const entitlement = await getEntitlement();
  if (!isActive() || useSessionStore.getState().isAuthenticated) return;
  queryClient.setQueryData(["me"], me);
  queryClient.setQueryData(["clientProfile", profile.id], profile);
  useOnboardingStore.getState().resetFromProfile(profile);
  useOnboardingStore.getState().setIdentity({ userId: me.id, clientProfileId: profile.id });
  logInPurchases(me.id);
  useSessionStore.getState().setSession({
    userId: me.id,
    clientProfileId: profile.id,
    entryRoute: profile.onboardingCompletedAt || Number(profile.onboardingStepCompleted ?? 0) >= 3
      ? "ProgramReview" : "OnboardingEntry",
    subscriptionStatus: entitlement.subscription_status,
    trialExpiresAt: entitlement.trial_expires_at,
  });
}
