import { authGetJson, authPatchJson } from "./client";

export type MeResponse = {
  id: string;
  clientProfileId: string | null;
};

export type LinkClientProfilePayload = {
  clientProfileId: string;
};

export async function getMe(): Promise<MeResponse> {
  return authGetJson<MeResponse>("/api/me");
}

export async function linkClientProfileToMe(payload: LinkClientProfilePayload): Promise<MeResponse> {
  return authPatchJson<MeResponse, LinkClientProfilePayload>("/api/users/me", payload);
}
