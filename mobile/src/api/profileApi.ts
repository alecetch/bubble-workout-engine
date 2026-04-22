import { authPatchJson } from "./client";
import { getClientProfile } from "./clientProfiles";
import { getMe } from "./me";

export async function getPreferredUnit(): Promise<"kg" | "lbs"> {
  const me = await getMe();
  if (!me.clientProfileId) {
    return "kg";
  }

  const profile = await getClientProfile(me.clientProfileId);
  return profile.preferredUnit === "lbs" ? "lbs" : "kg";
}

export async function updatePreferredUnit(unit: "kg" | "lbs"): Promise<void> {
  await authPatchJson<unknown, { preferredUnit: "kg" | "lbs" }>(
    "/api/users/me",
    { preferredUnit: unit },
  );
}

export async function getPreferredHeightUnit(): Promise<"cm" | "ft"> {
  const me = await getMe();
  if (!me.clientProfileId) {
    return "cm";
  }
  const profile = await getClientProfile(me.clientProfileId);
  return profile.preferredHeightUnit === "ft" ? "ft" : "cm";
}

export async function updatePreferredHeightUnit(unit: "cm" | "ft"): Promise<void> {
  await authPatchJson<unknown, { preferredHeightUnit: "cm" | "ft" }>(
    "/api/users/me",
    { preferredHeightUnit: unit },
  );
}
