import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { OnboardingEntry } from "../screens/onboarding/OnboardingEntry";
import { Step1GoalsScreen } from "../screens/onboarding/Step1GoalsScreen";
import { Step2bBaselineLoadsScreen } from "../screens/onboarding/Step2bBaselineLoadsScreen";
import { Step2EquipmentScreen } from "../screens/onboarding/Step2EquipmentScreen";
import { Step2bBaselineLoadsScreen } from "../screens/onboarding/Step2bBaselineLoadsScreen";
import { Step3ScheduleMetricsScreen } from "../screens/onboarding/Step3ScheduleMetricsScreen";
import { ExerciseDecisionHistoryScreen } from "../screens/program/ExerciseDecisionHistoryScreen";
import { ProgramReviewScreen } from "../screens/program/ProgramReviewScreen";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

export type OnboardingStackParamList = {
  OnboardingEntry: undefined;
  Step1Goals: undefined;
  Step2Equipment: undefined;
  Step2bBaselineLoads: undefined;
  Step3Schedule: undefined;
  ProgramReview: undefined;
  ProgramDashboard: {
    programId?: string;
  } | undefined;
  ProgramDay: {
    programDayId: string;
  };
  ExerciseDecisionHistory: {
    programExerciseId: string;
    exerciseName: string;
  };
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

const stepTransitionOptions: NativeStackNavigationOptions = {
  animation: "slide_from_right",
  animationDuration: 240,
  gestureEnabled: true,
};

type OnboardingNavigatorProps = {
  initialRouteName?: keyof OnboardingStackParamList;
};

function OnboardingPlaceholderScreen(): React.JSX.Element {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Home Placeholder</Text>
      <Text style={styles.body}>Onboarding navigator is mounted; real screens are temporarily removed.</Text>
    </View>
  );
}

export function OnboardingNavigator({ initialRouteName = "OnboardingEntry" }: OnboardingNavigatorProps): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="OnboardingEntry" component={OnboardingEntry} />
      <Stack.Screen name="Step1Goals" component={Step1GoalsScreen} options={stepTransitionOptions} />
      <Stack.Screen name="Step2Equipment" component={Step2EquipmentScreen} options={stepTransitionOptions} />
      <Stack.Screen name="Step2bBaselineLoads" component={Step2bBaselineLoadsScreen} options={stepTransitionOptions} />
      <Stack.Screen name="Step3Schedule" component={Step3ScheduleMetricsScreen} options={stepTransitionOptions} />
      <Stack.Screen name="ProgramReview" component={ProgramReviewScreen} options={stepTransitionOptions} />
      <Stack.Screen name="ExerciseDecisionHistory" component={ExerciseDecisionHistoryScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
});
