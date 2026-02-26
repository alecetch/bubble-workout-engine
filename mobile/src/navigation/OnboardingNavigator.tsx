import React from "react";
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { OnboardingEntry } from "../screens/onboarding/OnboardingEntry";
import { Step1GoalsScreen } from "../screens/onboarding/Step1GoalsScreen";
import { Step2EquipmentScreen } from "../screens/onboarding/Step2EquipmentScreen";
import { Step3ScheduleMetricsScreen } from "../screens/onboarding/Step3ScheduleMetricsScreen";
import { ProgramReviewScreen } from "../screens/ProgramReviewScreen";

export type OnboardingStackParamList = {
  OnboardingEntry: undefined;
  Step1Goals: undefined;
  Step2Equipment: undefined;
  Step3Schedule: undefined;
  ProgramReview: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

const stepTransitionOptions: NativeStackNavigationOptions = {
  animation: "slide_from_right",
  animationDuration: 240,
  gestureEnabled: true,
};

export function OnboardingNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="OnboardingEntry"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="OnboardingEntry" component={OnboardingEntry} />
      <Stack.Screen name="Step1Goals" component={Step1GoalsScreen} options={stepTransitionOptions} />
      <Stack.Screen name="Step2Equipment" component={Step2EquipmentScreen} options={stepTransitionOptions} />
      <Stack.Screen name="Step3Schedule" component={Step3ScheduleMetricsScreen} options={stepTransitionOptions} />
      <Stack.Screen name="ProgramReview" component={ProgramReviewScreen} options={stepTransitionOptions} />
    </Stack.Navigator>
  );
}
