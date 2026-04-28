import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { OnboardingNavigator, type OnboardingStackParamList } from "./OnboardingNavigator";
import type { HistoryStackParamList } from "./HistoryStackNavigator";
import type { ProgramsStackParamList } from "./ProgramsStackNavigator";
import type { SettingsStackParamList } from "./SettingsStackNavigator";
import type { AppEntryRoute } from "../state/session/sessionStore";
import { colors } from "../theme/colors";

export type RootTabParamList = {
  HomeTab: NavigatorScreenParams<OnboardingStackParamList> | undefined;
  ProgramsTab: NavigatorScreenParams<ProgramsStackParamList> | undefined;
  TodayTab: undefined;
  HistoryTab: NavigatorScreenParams<HistoryStackParamList> | undefined;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList> | undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

type AppTabsProps = {
  homeInitialRoute: AppEntryRoute;
};

function ProgramsTabScreen(): React.JSX.Element {
  console.log("[boot] ProgramsTabScreen require start");
  const mod = require("./ProgramsStackNavigator") as typeof import("./ProgramsStackNavigator");
  console.log("[boot] ProgramsTabScreen require success");
  return <mod.ProgramsStackNavigator />;
}

function TodayTabScreen(): React.JSX.Element {
  console.log("[boot] TodayTabScreen require start");
  const mod = require("../screens/today/TodayScreen") as typeof import("../screens/today/TodayScreen");
  console.log("[boot] TodayTabScreen require success");
  return <mod.TodayScreen />;
}

function HistoryTabScreen(): React.JSX.Element {
  console.log("[boot] HistoryTabScreen require start");
  const mod = require("./HistoryStackNavigator") as typeof import("./HistoryStackNavigator");
  console.log("[boot] HistoryTabScreen require success");
  return <mod.HistoryStackNavigator />;
}

function SettingsTabScreen(): React.JSX.Element {
  console.log("[boot] SettingsTabScreen require start");
  const mod = require("./SettingsStackNavigator") as typeof import("./SettingsStackNavigator");
  console.log("[boot] SettingsTabScreen require success");
  return <mod.SettingsStackNavigator />;
}

export function AppTabs({ homeInitialRoute }: AppTabsProps): React.JSX.Element {
  console.log("[boot] AppTabs render", { homeInitialRoute });

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
      <Tab.Screen name="ProgramsTab" component={ProgramsTabScreen} options={{ title: "Programs" }} />
      <Tab.Screen name="TodayTab" component={TodayTabScreen} options={{ title: "Today" }} />
      <Tab.Screen name="HistoryTab" component={HistoryTabScreen} options={{ title: "History" }} />
      <Tab.Screen name="SettingsTab" component={SettingsTabScreen} options={{ title: "Settings" }} />
    </Tab.Navigator>
  );
}
