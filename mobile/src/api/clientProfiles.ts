import type { OnboardingDraft } from "../state/onboarding/types";
import { getJson, patchJson, postJson } from "./client";

export type ClientProfileServer = OnboardingDraft & {
  id: string;
  userId: string;
  onboardingCompletedAt?: string | null;
};

export type CreateClientProfileInput = Partial<Omit<ClientProfileServer, "id" | "userId">>;
export type UpdateClientProfileInput = Partial<Omit<ClientProfileServer, "id" | "userId">>;

export function getClientProfile(profileId: string): Promise<ClientProfileServer> {
  return getJson<ClientProfileServer>(`/client-profiles/${profileId}`);
}

export function createClientProfile(payload: CreateClientProfileInput): Promise<ClientProfileServer> {
  return postJson<ClientProfileServer, CreateClientProfileInput>("/client-profiles", payload);
}

export function updateClientProfile(
  profileId: string,
  payload: UpdateClientProfileInput,
): Promise<ClientProfileServer> {
  return patchJson<ClientProfileServer, UpdateClientProfileInput>(`/client-profiles/${profileId}`, payload);
}
