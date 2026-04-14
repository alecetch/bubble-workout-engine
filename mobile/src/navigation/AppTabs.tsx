import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { HistoryStackNavigator, type HistoryStackParamList } from "./HistoryStackNavigator";
import { OnboardingNavigator, type OnboardingStackParamList } from "./OnboardingNavigator";
import { ProgramsStackNavigator, type ProgramsStackParamList } from "./ProgramsStackNavigator";
import { TodayScreen } from "../screens/today/TodayScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import type { AppEntryRoute } from "../state/session/sessionStore";
import { colors } from "../theme/colors";

export type RootTabParamList = {
  HomeTab: NavigatorScreenParams<OnboardingStackParamList> | undefined;
  ProgramsTab: NavigatorScreenParams<ProgramsStackParamList> | undefined;
  TodayTab: undefined;
  HistoryTab: NavigatorScreenParams<HistoryStackParamList> | undefined;
  SettingsTab: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

type AppTabsProps = {
  homeInitialRoute: AppEntryRoute;
};

export function AppTabs({ homeInitialRoute }: AppTabsProps): React.JSX.Element {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          const iconName =
            route.name === "HomeTab"
              ? "home-outline"
              : route.name === "ProgramsTab"
                ? "barbell-outline"
                : route.name === "TodayTab"
                  ? "calendar-outline"
                  : route.name === "HistoryTab"
                    ? "time-outline"
                    : "settings-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" options={{ title: "Home" }}>
        {() => <OnboardingNavigator initialRouteName={homeInitialRoute} />}
      </Tab.Screen>
      <Tab.Screen name="ProgramsTab" component={ProgramsStackNavigator} options={{ title: "Programs" }} />
      <Tab.Screen name="TodayTab" component={TodayScreen} options={{ title: "Today" }} />
      <Tab.Screen name="HistoryTab" component={HistoryStackNavigator} options={{ title: "History" }} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ title: "Settings" }} />
    </Tab.Navigator>
  );
}
