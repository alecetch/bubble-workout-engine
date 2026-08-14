import type * as Notifications from "expo-notifications";
import { navigationRef } from "./navigationRef";

export function navigateFromNotificationResponse(
  response: Notifications.NotificationResponse | null,
): boolean {
  if (!response || !navigationRef.isReady()) return false;

  const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
  const event = typeof data.event === "string" ? data.event : null;
  if (!event) return true;

  if (event === "pr" || event === "pr_multi") {
    navigationRef.navigate("HistoryTab", { screen: "HistoryMain" });
    return true;
  }

  if ((event === "deload" || event === "reminder") && typeof data.programDayId === "string") {
    navigationRef.navigate("ProgramsTab", {
      screen: "ProgramDay",
      params: { programDayId: data.programDayId },
    });
    return true;
  }

  return true;
}
