import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer, DefaultTheme, type Theme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
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

export default function App(): React.JSX.Element {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
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

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer theme={appTheme}>
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
