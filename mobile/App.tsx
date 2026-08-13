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
import { navigateFromNotificationResponse } from "./src/navigation/notificationRouting";
import { useSessionStore } from "./src/state/session/sessionStore";
import { colors } from "./src/theme/colors";
import { getAppStorage } from "./src/utils/appStorage";
import { logger } from "./src/utils/logger";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

// Notification tap-through handling is off by default because of an unresolved
// native HostFunction failure (see docs/specs/mobile-notification-tap-through-decision-spec.md).
// Set EXPO_PUBLIC_ENABLE_NOTIFICATION_TAP_THROUGH=true on a dev-client build to test
// re-enabling it without a source change. Token registration is unaffected either way.
const ENABLE_NOTIFICATION_RESPONSE_HANDLERS =
  process.env.EXPO_PUBLIC_ENABLE_NOTIFICATION_TAP_THROUGH === "true";
const CAN_USE_NOTIFICATIONS_NATIVE = Constants.executionEnvironment !== "storeClient";

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
  } catch (error) {
    logger.error(
      "notifications",
      "setNotificationHandler failed",
      error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error),
    );
  }
}

let pendingNotificationResponse: Notifications.NotificationResponse | null = null;

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

  logger.boot("render", { isAuthenticated, hasUserId: Boolean(userId), entryRoute });

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
      logger.boot("push registration skipped", { reason: "expo-go" });
      return;
    }
    if (!isAuthenticated || !userId) return;

    (async () => {
      try {
        logger.boot("push registration start", { platform: Platform.OS });
        if (Platform.OS === "android") {
          logger.boot("push setNotificationChannelAsync start");
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
          });
          logger.boot("push setNotificationChannelAsync success");
        }

        logger.boot("push requestPermissionsAsync start");
        const { status } = await Notifications.requestPermissionsAsync();
        logger.boot("push requestPermissionsAsync success", { status });
        if (status !== "granted") return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        logger.boot("push getExpoPushTokenAsync start", { hasProjectId: Boolean(projectId) });
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        logger.boot("push getExpoPushTokenAsync success", { hasToken: Boolean(tokenData.data) });
        logger.boot("push registerPushToken start");
        await registerPushToken(tokenData.data);
        logger.boot("push registerPushToken success");
      } catch (error) {
        // Deliberately logger.boot (console.log), not logger.warn/error: push
        // registration routinely fails on simulators/emulators and devices
        // without notification permission. console.warn/error trigger React
        // Native's LogBox overlay in dev/debug builds, which then sits on top
        // of the UI and can swallow touch/scroll gestures (this broke the
        // Maestro E2E Settings flow in CI when this was logger.error).
        logger.boot(
          "push registration failed",
          error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error),
        );
        // Never block app startup on notification registration.
      }
    })();
  }, [isAuthenticated, userId]);

  React.useEffect(() => {
    const key = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? "";
    logger.boot("configurePurchases start", { hasKey: Boolean(key) });
    configurePurchases(key);
    logger.boot("configurePurchases done");
  }, []);

  React.useEffect(() => {
    if (!CAN_USE_NOTIFICATIONS_NATIVE) return undefined;
    if (!ENABLE_NOTIFICATION_RESPONSE_HANDLERS) return undefined;

    let sub: { remove: () => void } | null = null;

    try {
      logger.boot("notification response hydration start");
      void Notifications.getLastNotificationResponseAsync()
        .then(handleNotificationResponse)
        .catch((error) => {
          logger.error(
            "notifications",
            "last notification response hydration failed",
            error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error),
          );
        });

      logger.boot("notification response listener start");
      sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
      logger.boot("notification response listener success");
    } catch (error) {
      logger.error(
        "notifications",
        "response listener registration failed",
        error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error),
      );
    }

    return () => {
      try {
        sub?.remove();
      } catch (error) {
        logger.error(
          "notifications",
          "listener teardown failed",
          error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error),
        );
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
