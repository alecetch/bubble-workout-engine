import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer, DefaultTheme, type Theme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { configurePurchases } from "./src/lib/purchases";
import { registerPushToken } from "./src/api/notifications";
import { navigationRef } from "./src/navigation/navigationRef";
import { useSessionStore } from "./src/state/session/sessionStore";
import { colors } from "./src/theme/colors";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
  const AuthModule = React.useMemo(
    () =>
      !isAuthenticated
        ? (require("./src/navigation/AuthNavigator") as typeof import("./src/navigation/AuthNavigator"))
        : null,
    [isAuthenticated],
  );
  const AppTabsModule = React.useMemo(
    () =>
      isAuthenticated
        ? (require("./src/navigation/AppTabs") as typeof import("./src/navigation/AppTabs"))
        : null,
    [isAuthenticated],
  );

  React.useEffect(() => {
    if (!isAuthenticated || !userId) return;

    (async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
          });
        }

        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") return;

        const tokenData = await Notifications.getExpoPushTokenAsync();
        await registerPushToken(tokenData.data);
      } catch {
        // Never block app startup on notification registration.
      }
    })();
  }, [isAuthenticated, userId]);

  React.useEffect(() => {
    const key = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? "";
    configurePurchases(key);
  }, []);

  React.useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then(handleNotificationResponse);

    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
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
          AppTabsModule ? <AppTabsModule.AppTabs homeInitialRoute={entryRoute} /> : null
        ) : (
          AuthModule ? <AuthModule.AuthNavigator /> : null
        )}
      </NavigationContainer>
    </QueryClientProvider>
  );
}
