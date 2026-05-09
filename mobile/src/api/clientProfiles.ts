import type { AnchorLiftEntry, OnboardingDraft } from "../state/onboarding/types";
import { authGetJson, authPatchJson, authPostJson } from "./client";

export type ClientProfileServer = OnboardingDraft & {
  id: string;
  userId: string;
  onboardingCompletedAt?: string | null;
  preferredUnit?: "kg" | "lbs" | null;
  preferredHeightUnit?: "cm" | "ft" | null;
};

export type CreateClientProfileInput = Partial<Omit<ClientProfileServer, "id" | "userId">>;
export type UpdateClientProfileInput = Partial<Omit<ClientProfileServer, "id" | "userId">> & {
  anchorLifts?: AnchorLiftEntry[];
  anchorLiftsSkipped?: boolean;
};

export function getClientProfile(profileId: string): Promise<ClientProfileServer> {
  return authGetJson<ClientProfileServer>(`/api/client-profiles/${profileId}`);
}

export async function createClientProfile(payload: CreateClientProfileInput): Promise<ClientProfileServer> {
  return authPostJson<ClientProfileServer, CreateClientProfileInput>("/api/client-profiles", payload);
}

export function updateClientProfile(
  profileId: string,
  payload: UpdateClientProfileInput,
): Promise<ClientProfileServer> {
  return authPatchJson<ClientProfileServer, UpdateClientProfileInput>(
    `/api/client-profiles/${profileId}`,
    payload,
  );
}
