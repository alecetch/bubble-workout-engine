import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { OnboardingEntry } from "../screens/onboarding/OnboardingEntry";
import { Step1GoalsScreen } from "../screens/onboarding/Step1GoalsScreen";
import { Step2EquipmentScreen } from "../screens/onboarding/Step2EquipmentScreen";
import { Step2bBaselineLoadsScreen } from "../screens/onboarding/Step2bBaselineLoadsScreen";
import { Step3ScheduleMetricsScreen } from "../screens/onboarding/Step3ScheduleMetricsScreen";
import { ExerciseDecisionHistoryScreen } from "../screens/program/ExerciseDecisionHistoryScreen";
import { PaywallScreen } from "../screens/paywall/PaywallScreen";
import { ProgramCompleteScreen } from "../screens/program/ProgramCompleteScreen";
import type { ExerciseDetailParams } from "../screens/program/ExerciseDetailScreen";
import { ProgramEndCheckScreen } from "../screens/program/ProgramEndCheckScreen";
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
  ProgramReview: {
    preserveDraft?: boolean;
  } | undefined;
  Paywall: undefined;
  ProgramEndCheck: {
    programId: string;
  };
  ProgramComplete: {
    programId: string;
  };
  ProgramDashboard: {
    programId?: string;
  } | undefined;
  ProgramDay: {
    programDayId: string;
  };
  ExerciseDetail: ExerciseDetailParams;
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

function ProgramDashboardScreenDeferred(props: any): React.JSX.Element {
  const mod = require("../screens/program/ProgramDashboardScreen") as typeof import("../screens/program/ProgramDashboardScreen");
  return <mod.ProgramDashboardScreen {...props} />;
}

function ProgramDayScreenDeferred(props: any): React.JSX.Element {
  const mod = require("../screens/program/ProgramDayScreen") as typeof import("../screens/program/ProgramDayScreen");
  return <mod.ProgramDayScreen {...props} />;
}

function ExerciseDetailScreenDeferred(props: any): React.JSX.Element {
  const mod = require("../screens/program/ExerciseDetailScreen") as typeof import("../screens/program/ExerciseDetailScreen");
  return <mod.ExerciseDetailScreen {...props} />;
}

export function OnboardingNavigator({ initialRouteName = "OnboardingEntry" }: OnboardingNavigatorProps): React.JSX.Element {
  console.log("[boot] OnboardingNavigator render", { initialRouteName });
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
      <Stack.Screen name="ProgramEndCheck" component={ProgramEndCheckScreen} options={stepTransitionOptions} />
      <Stack.Screen name="ProgramComplete" component={ProgramCompleteScreen} options={stepTransitionOptions} />
      <Stack.Screen name="ProgramReview" component={ProgramReviewScreen} options={stepTransitionOptions} />
      <Stack.Screen name="ProgramDashboard" component={ProgramDashboardScreenDeferred} options={stepTransitionOptions} />
      <Stack.Screen name="ProgramDay" component={ProgramDayScreenDeferred} options={{ ...stepTransitionOptions, headerShown: true }} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreenDeferred} options={{ ...stepTransitionOptions, headerShown: true }} />
      <Stack.Screen name="Paywall" component={PaywallScreen} options={stepTransitionOptions} />
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
