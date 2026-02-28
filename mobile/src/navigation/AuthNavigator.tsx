import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { WelcomeLoginScreen } from "../screens/auth/WelcomeLoginScreen";
import { DevLoginScreen } from "../screens/auth/DevLoginScreen";
import { ResetPasswordScreen } from "../screens/auth/ResetPasswordScreen";

export type AuthStackParamList = {
  WelcomeLogin: undefined;
  DevLogin: undefined;
  ResetPassword: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="WelcomeLogin"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="WelcomeLogin" component={WelcomeLoginScreen} />
      <Stack.Screen name="DevLogin" component={DevLoginScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}
