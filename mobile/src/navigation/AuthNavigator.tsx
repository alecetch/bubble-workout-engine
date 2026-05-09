import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";
import { ResetPasswordCodeScreen } from "../screens/auth/ResetPasswordCodeScreen";
import { ResetPasswordScreen } from "../screens/auth/ResetPasswordScreen";
import { WelcomeLoginScreen } from "../screens/auth/WelcomeLoginScreen";

export type AuthStackParamList = {
  WelcomeLogin: undefined;
  Login: undefined;
  Register: undefined;
  ResetPassword: undefined;
  ResetPasswordCode: { email: string };
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
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="ResetPasswordCode" component={ResetPasswordCodeScreen} />
    </Stack.Navigator>
  );
}
