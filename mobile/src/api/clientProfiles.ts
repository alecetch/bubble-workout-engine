import type { OnboardingDraft } from "../state/onboarding/types";
import { engineGetJson, enginePatchJson, enginePostJson } from "./client";
import { getUserIdentityQueryString } from "./userIdentity";

export type ClientProfileServer = OnboardingDraft & {
  id: string;
  userId: string;
  onboardingCompletedAt?: string | null;
};

export type CreateClientProfileInput = Partial<Omit<ClientProfileServer, "id" | "userId">>;
export type UpdateClientProfileInput = Partial<Omit<ClientProfileServer, "id" | "userId">>;

export function getClientProfile(profileId: string): Promise<ClientProfileServer> {
  return engineGetJson<ClientProfileServer>(`/client-profiles/${profileId}`);
}

export async function createClientProfile(payload: CreateClientProfileInput): Promise<ClientProfileServer> {
  const query = await getUserIdentityQueryString();
  return enginePostJson<ClientProfileServer, CreateClientProfileInput>(
    `/client-profiles?${query}`,
    payload,
  );
}

export function updateClientProfile(
  profileId: string,
  payload: UpdateClientProfileInput,
): Promise<ClientProfileServer> {
  return enginePatchJson<ClientProfileServer, UpdateClientProfileInput>(`/client-profiles/${profileId}`, payload);
}
