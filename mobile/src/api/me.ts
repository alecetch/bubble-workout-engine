import { engineGetJson, enginePatchJson } from "./client";
import { getOrCreateUserId } from "./userIdentity";

export type MeResponse = {
  id: string;
  clientProfileId: string | null;
};

export type LinkClientProfilePayload = {
  clientProfileId: string;
};

export async function getMe(): Promise<MeResponse> {
  const userId = await getOrCreateUserId();
  return engineGetJson<MeResponse>(`/me?user_id=${encodeURIComponent(userId)}`);
}

export async function linkClientProfileToMe(payload: LinkClientProfilePayload): Promise<MeResponse> {
  const userId = await getOrCreateUserId();
  return enginePatchJson<MeResponse, LinkClientProfilePayload>(`/users/me?user_id=${encodeURIComponent(userId)}`, payload);
}
