import type { OnboardingDraft } from "../state/onboarding/types";
import { engineGetJson, enginePatchJson, enginePostJson } from "./client";
import { getOrCreateUserId } from "./userIdentity";

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
  const userId = await getOrCreateUserId();
  return enginePostJson<ClientProfileServer, CreateClientProfileInput>(
    `/client-profiles?user_id=${encodeURIComponent(userId)}`,
    payload,
  );
}

export function updateClientProfile(
  profileId: string,
  payload: UpdateClientProfileInput,
): Promise<ClientProfileServer> {
  return enginePatchJson<ClientProfileServer, UpdateClientProfileInput>(`/client-profiles/${profileId}`, payload);
}
