import { authGetJson } from "./client";

export type EntitlementResponse = {
  ok: boolean;
  subscription_status: "trialing" | "active" | "expired" | "cancelled";
  is_active: boolean;
  trial_days_remaining: number | null;
  trial_expires_at: string;
  subscription_expires_at: string | null;
};

export function getEntitlement(): Promise<EntitlementResponse> {
  return authGetJson<EntitlementResponse>("/api/users/me/entitlement");
}
