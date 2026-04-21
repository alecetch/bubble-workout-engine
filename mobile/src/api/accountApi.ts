import { authDeleteJson, authGetJson, authPatchJson, authPostJson } from "./client";

export type AccountInfo = {
  email: string;
  displayName: string | null;
};

export async function getAccountInfo(): Promise<AccountInfo> {
  const raw = await authGetJson<{ ok: boolean; email: string; displayName: string | null }>(
    "/api/users/me/account",
  );
  return {
    email: raw.email ?? "",
    displayName: raw.displayName ?? null,
  };
}

export async function updateDisplayName(displayName: string): Promise<string> {
  const raw = await authPatchJson<{ ok: boolean; displayName: string }, { displayName: string }>(
    "/api/users/me/display-name",
    { displayName },
  );
  return raw.displayName;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await authPostJson<{ ok: boolean }, { currentPassword: string; newPassword: string }>(
    "/api/auth/change-password",
    { currentPassword, newPassword },
  );
}

export async function deleteAccount(): Promise<void> {
  await authDeleteJson<{ ok: boolean }>("/api/users/me");
}
