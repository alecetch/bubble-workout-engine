import { engineGetJson, enginePatchJson } from "./client";
import { getUserIdentityQueryString } from "./userIdentity";

export type MeResponse = {
  id: string;
  clientProfileId: string | null;
};

export type LinkClientProfilePayload = {
  clientProfileId: string;
};

export async function getMe(): Promise<MeResponse> {
  const query = await getUserIdentityQueryString();
  return engineGetJson<MeResponse>(`/me?${query}`);
}

export async function linkClientProfileToMe(payload: LinkClientProfilePayload): Promise<MeResponse> {
  const query = await getUserIdentityQueryString();
  return enginePatchJson<MeResponse, LinkClientProfilePayload>(`/users/me?${query}`, payload);
}
