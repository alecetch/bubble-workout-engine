import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AccountNameScreen } from "../screens/settings/AccountNameScreen";
import { ChangePasswordScreen } from "../screens/settings/ChangePasswordScreen";
import { NotificationTimeScreen } from "../screens/settings/NotificationTimeScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { UnitPickerScreen } from "../screens/settings/UnitPickerScreen";

export type SettingsStackParamList = {
  Settings: undefined;
  AccountName: { currentName: string | null };
  ChangePassword: undefined;
  NotificationTime: { currentTime: string };
  UnitPicker: { currentUnit: "kg" | "lbs"; currentHeightUnit: "cm" | "ft" };
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsStackNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator initialRouteName="Settings" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="AccountName" component={AccountNameScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="NotificationTime" component={NotificationTimeScreen} />
      <Stack.Screen name="UnitPicker" component={UnitPickerScreen} />
    </Stack.Navigator>
  );
}
