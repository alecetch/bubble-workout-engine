import { getJson, patchJson } from "./client";

export type MeResponse = {
  id: string;
  clientProfileId: string | null;
};

export type LinkClientProfilePayload = {
  clientProfileId: string;
};

export function getMe(): Promise<MeResponse> {
  return getJson<MeResponse>("/me");
}

export function linkClientProfileToMe(payload: LinkClientProfilePayload): Promise<MeResponse> {
  return patchJson<MeResponse, LinkClientProfilePayload>("/users/me", payload);
}
