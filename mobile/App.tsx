import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer, DefaultTheme, type Theme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { AuthNavigator } from "./src/navigation/AuthNavigator";
import { AppTabs } from "./src/navigation/AppTabs";
import { configurePurchases } from "./src/lib/purchases";
import { registerPushToken } from "./src/api/notifications";
import { navigationRef } from "./src/navigation/navigationRef";
import { useSessionStore } from "./src/state/session/sessionStore";
import { colors } from "./src/theme/colors";
import { getAppStorage } from "./src/utils/appStorage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

// Notification tap-through handling can be re-enabled once the underlying
// native HostFunction failure is understood. Token registration stays enabled.
const ENABLE_NOTIFICATION_RESPONSE_HANDLERS = false;
const CAN_USE_NOTIFICATIONS_NATIVE = Constants.executionEnvironment !== "storeClient";

function logBoot(message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.log(`[boot] ${message}`);
    return;
  }
  console.log(`[boot] ${message}`, detail);
}

const appTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.card,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.accent,
  },
};

if (ENABLE_NOTIFICATION_RESPONSE_HANDLERS) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Some native notification host functions can fail on startup in unsupported runtimes.
  }
}

let pendingNotificationResponse: Notifications.NotificationResponse | null = null;

function navigateFromNotificationResponse(response: Notifications.NotificationResponse | null): boolean {
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

function handleNotificationResponse(response: Notifications.NotificationResponse | null): void {
  if (!navigateFromNotificationResponse(response)) {
    pendingNotificationResponse = response;
  }
}

function flushPendingNotificationResponse(): void {
  if (!pendingNotificationResponse) return;
  if (navigateFromNotificationResponse(pendingNotificationResponse)) {
    pendingNotificationResponse = null;
  }
}

export default function App(): React.JSX.Element {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const userId = useSessionStore((state) => state.userId);
  const entryRoute = useSessionStore((state) => state.entryRoute);

  logBoot("render", { isAuthenticated, hasUserId: Boolean(userId), entryRoute });

  React.useEffect(() => {
    void (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (!url) return;
        const match = url.match(/(?:^|\/)ref\/([A-Z2-9]{8})(?:$|\?)/);
        if (!match?.[1]) return;
        await getAppStorage().setItem("pendingReferralCode", match[1]);
      } catch {
        // Referral deep-link capture is best-effort only.
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!CAN_USE_NOTIFICATIONS_NATIVE) {
      logBoot("push registration skipped", { reason: "expo-go" });
      return;
    }
    if (!isAuthenticated || !userId) return;

    (async () => {
      try {
        logBoot("push registration start", { platform: Platform.OS });
        if (Platform.OS === "android") {
          logBoot("push setNotificationChannelAsync start");
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
          });
          logBoot("push setNotificationChannelAsync success");
        }

        logBoot("push requestPermissionsAsync start");
        const { status } = await Notifications.requestPermissionsAsync();
        logBoot("push requestPermissionsAsync success", { status });
        if (status !== "granted") return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        logBoot("push getExpoPushTokenAsync start", { hasProjectId: Boolean(projectId) });
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        logBoot("push getExpoPushTokenAsync success", { hasToken: Boolean(tokenData.data) });
        logBoot("push registerPushToken start");
        await registerPushToken(tokenData.data);
        logBoot("push registerPushToken success");
      } catch (error) {
        logBoot(
          "push registration failed",
          error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error),
        );
        // Never block app startup on notification registration.
      }
    })();
  }, [isAuthenticated, userId]);

  React.useEffect(() => {
    const key = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? "";
    logBoot("configurePurchases start", { hasKey: Boolean(key) });
    configurePurchases(key);
    logBoot("configurePurchases done");
  }, []);

  React.useEffect(() => {
    if (!CAN_USE_NOTIFICATIONS_NATIVE) return undefined;
    if (!ENABLE_NOTIFICATION_RESPONSE_HANDLERS) return undefined;

    let sub: { remove: () => void } | null = null;

    try {
      logBoot("notification response hydration start");
      void Notifications.getLastNotificationResponseAsync()
        .then(handleNotificationResponse)
        .catch(() => {
          // Ignore notification hydration issues during startup.
        });

      logBoot("notification response listener start");
      sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
      logBoot("notification response listener success");
    } catch {
      // Never block app startup on notification listener registration.
    }

    return () => {
      try {
        sub?.remove();
      } catch {
        // Ignore teardown errors from notification listeners.
      }
    };
  }, []);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    flushPendingNotificationResponse();
  }, [isAuthenticated]);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer
        theme={appTheme}
        ref={navigationRef}
        onReady={flushPendingNotificationResponse}
      >
        <StatusBar style="light" />
        {isAuthenticated ? (
          <AppTabs homeInitialRoute={entryRoute} />
        ) : (
          <AuthNavigator />
        )}
      </NavigationContainer>
    </QueryClientProvider>
  );
}
