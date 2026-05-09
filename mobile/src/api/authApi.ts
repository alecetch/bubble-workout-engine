import { apiFetch } from "./client";

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  client_profile_id: string;
  subscription_status?: string;
  trial_expires_at?: string | null;
};

export type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

export async function apiRegister(
  email: string,
  password: string,
  referredByCode?: string | null,
): Promise<AuthTokens> {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: {
      email,
      password,
      ...(referredByCode ? { referredByCode } : {}),
    },
  });
}

export async function apiLogin(email: string, password: string): Promise<AuthTokens> {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function apiRefresh(refreshToken: string): Promise<RefreshResponse> {
  return apiFetch("/api/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

export async function apiLogout(refreshToken: string): Promise<void> {
  await apiFetch("/api/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}
