import { entryFor } from "./onboardingStatus";
import { isSessionExpiredError } from "../../api/client";
import { getAccessToken } from "../../api/tokenStorage";
import { getMe } from "../../api/me";
import { getClientProfile } from "../../api/clientProfiles";
import { getEntitlement } from "../../api/entitlement";
import { queryClient } from "../../api/queryClient";
import { useOnboardingStore } from "../onboarding/onboardingStore";
import { useSessionStore } from "./sessionStore";
import { reportError } from "../../lib/crashReporting";
import { logInPurchases } from "../../lib/purchases";

// API client refreshes expired access tokens and clears revoked credentials.
// This helper does not clear credentials; the existing API client owns invalidation.
export type RestoreOutcome = "restored" | "signed_out" | "unreachable";

function outcome(result: RestoreOutcome, stage: "token_read" | "network", error?: unknown): RestoreOutcome {
  if (process.env.EXPO_PUBLIC_SMOKE_DIAGNOSTICS === "true") {
    const errorType = error instanceof Error ? error.constructor.name : error === undefined ? "none" : typeof error;
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const safeCode = typeof code === "number" && Number.isFinite(code)
      ? String(code)
      : typeof code === "string" && /^(?:-?\d{1,12}|[A-Z_][A-Z0-9_]{0,63})$/i.test(code) ? code : undefined;
    console.warn(`[smoke] restore outcome=${result} stage=${stage} error=${errorType}${safeCode === undefined ? "" : ` code=${safeCode}`}`);
  }
  return result;
}

export async function restoreSession(isActive: () => boolean = () => true): Promise<RestoreOutcome> {
  try {
    if (!await getAccessToken()) return outcome("signed_out", "token_read");
  } catch (error) {
    reportError(error, "session.token_read_failed");
    return outcome("signed_out", "token_read", error);
  }
  try {
    const me = await getMe();
    if (!me.clientProfileId) return outcome("signed_out", "network");
    const profile = await getClientProfile(me.clientProfileId);
    const entitlement = await getEntitlement();
    if (!isActive() || useSessionStore.getState().isAuthenticated) return outcome("restored", "network");
    queryClient.setQueryData(["me"], me);
    queryClient.setQueryData(["clientProfile", profile.id], profile);
    useOnboardingStore.getState().resetFromProfile(profile);
    useOnboardingStore.getState().setIdentity({ userId: me.id, clientProfileId: profile.id });
    logInPurchases(me.id);
    useSessionStore.getState().setSession({
      userId: me.id,
      clientProfileId: profile.id,
      ...entryFor(profile),
      subscriptionStatus: entitlement.subscription_status,
      trialExpiresAt: entitlement.trial_expires_at,
    });
    return outcome("restored", "network");
  } catch (error) {
    return outcome(isSessionExpiredError(error) ? "signed_out" : "unreachable", "network", error);
  }
}
