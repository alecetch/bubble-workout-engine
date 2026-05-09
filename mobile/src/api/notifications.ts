import { authGetJson, authPatchJson } from "./client";

export type NotificationPreferences = {
  reminderEnabled: boolean;
  reminderTimeLocalHhmm: string;
  reminderTimezone: string;
  prNotificationEnabled: boolean;
  deloadNotificationEnabled: boolean;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizePreferences(raw: unknown): NotificationPreferences {
  const value = asObject(raw);
  return {
    reminderEnabled: asBool(value.reminderEnabled, true),
    reminderTimeLocalHhmm: asStr(value.reminderTimeLocalHhmm, "08:00"),
    reminderTimezone: asStr(value.reminderTimezone, "UTC"),
    prNotificationEnabled: asBool(value.prNotificationEnabled, true),
    deloadNotificationEnabled: asBool(value.deloadNotificationEnabled, true),
  };
}

export async function registerPushToken(token: string): Promise<void> {
  await authPatchJson<unknown, { push_token: string }>(
    "/api/users/me/push-token",
    { push_token: token },
  );
}

export async function clearPushToken(): Promise<void> {
  await authPatchJson<unknown, { push_token: null }>(
    "/api/users/me/push-token",
    { push_token: null },
  );
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const raw = await authGetJson<unknown>("/api/users/me/notification-preferences");
  return normalizePreferences(raw);
}

export async function updateNotificationPreferences(
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const raw = await authPatchJson<unknown, Partial<NotificationPreferences>>(
    "/api/users/me/notification-preferences",
    prefs,
  );
  const value = asObject(raw);
  return normalizePreferences(value.preferences ?? value);
}
