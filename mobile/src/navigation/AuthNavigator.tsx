import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { WelcomeLoginScreen } from "../screens/auth/WelcomeLoginScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";
import { ResetPasswordScreen } from "../screens/auth/ResetPasswordScreen";

export type AuthStackParamList = {
  WelcomeLogin: undefined;
  Login: undefined;
  Register: undefined;
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
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}
