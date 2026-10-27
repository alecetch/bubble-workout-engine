import { ApiError, authGetJson, authPostJson } from "./client";

export type EntitlementResponse = {
  ok: boolean;
  subscription_status: "trialing" | "active" | "expired" | "cancelled";
  is_active: boolean;
  trial_days_remaining: number | null;
  trial_expires_at: string;
  subscription_expires_at: string | null;
  physique_consent_given: boolean;
  is_premium?: boolean;
  will_renew?: boolean | null;
  billing_issue?: boolean;
};

export function getEntitlement(): Promise<EntitlementResponse> {
  return authGetJson<EntitlementResponse>("/api/users/me/entitlement");
}

export async function syncEntitlement(): Promise<EntitlementResponse | null> {
  try {
    return await authPostJson<EntitlementResponse>("/api/users/me/entitlement/sync", {});
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 503)) return null;
    throw err;
  }
}
