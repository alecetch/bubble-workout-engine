import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProgramHubScreen } from "../screens/program/ProgramHubScreen";
import type { ExerciseDetailParams } from "../screens/program/ExerciseDetailScreen";
import { logger } from "../utils/logger";

export type ProgramsStackParamList = {
  ProgramHub: undefined;
  ProgramDashboard: {
    programId?: string;
    showReviewPrompt?: boolean;
    weekCompleteNumber?: number;
    weekCompleteSessions?: number;
  } | undefined;
  ProgramDay: { programDayId: string };
  ExerciseDetail: ExerciseDetailParams;
  ProgramEndCheck: { programId: string };
  ProgramComplete: { programId: string };
  ExerciseDecisionHistory: {
    programExerciseId: string;
    exerciseName: string;
  };
};

const Stack = createNativeStackNavigator<ProgramsStackParamList>();

function ProgramDashboardScreenDeferred(
  props: any,
): React.JSX.Element {
  logger.boot("ProgramsStack require ProgramDashboardScreen start");
  const mod = require("../screens/program/ProgramDashboardScreen") as typeof import("../screens/program/ProgramDashboardScreen");
  logger.boot("ProgramsStack require ProgramDashboardScreen success");
  return <mod.ProgramDashboardScreen {...props} />;
}

function ProgramDayScreenDeferred(
  props: any,
): React.JSX.Element {
  logger.boot("ProgramsStack require ProgramDayScreen start");
  const mod = require("../screens/program/ProgramDayScreen") as typeof import("../screens/program/ProgramDayScreen");
  logger.boot("ProgramsStack require ProgramDayScreen success");
  return <mod.ProgramDayScreen {...props} />;
}

function ProgramEndCheckScreenDeferred(
  props: any,
): React.JSX.Element {
  logger.boot("ProgramsStack require ProgramEndCheckScreen start");
  const mod = require("../screens/program/ProgramEndCheckScreen") as typeof import("../screens/program/ProgramEndCheckScreen");
  logger.boot("ProgramsStack require ProgramEndCheckScreen success");
  return <mod.ProgramEndCheckScreen {...props} />;
}

function ProgramCompleteScreenDeferred(
  props: any,
): React.JSX.Element {
  logger.boot("ProgramsStack require ProgramCompleteScreen start");
  const mod = require("../screens/program/ProgramCompleteScreen") as typeof import("../screens/program/ProgramCompleteScreen");
  logger.boot("ProgramsStack require ProgramCompleteScreen success");
  return <mod.ProgramCompleteScreen {...props} />;
}

function ExerciseDecisionHistoryScreenDeferred(
  props: any,
): React.JSX.Element {
  logger.boot("ProgramsStack require ExerciseDecisionHistoryScreen start");
  const mod = require("../screens/program/ExerciseDecisionHistoryScreen") as typeof import("../screens/program/ExerciseDecisionHistoryScreen");
  logger.boot("ProgramsStack require ExerciseDecisionHistoryScreen success");
  return <mod.ExerciseDecisionHistoryScreen {...props} />;
}

function ExerciseDetailScreenDeferred(
  props: any,
): React.JSX.Element {
  logger.boot("ProgramsStack require ExerciseDetailScreen start");
  const mod = require("../screens/program/ExerciseDetailScreen") as typeof import("../screens/program/ExerciseDetailScreen");
  logger.boot("ProgramsStack require ExerciseDetailScreen success");
  return <mod.ExerciseDetailScreen {...props} />;
}

export function ProgramsStackNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="ProgramHub"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="ProgramHub" component={ProgramHubScreen} />
      <Stack.Screen name="ProgramDashboard" component={ProgramDashboardScreenDeferred} />
      <Stack.Screen name="ProgramDay" component={ProgramDayScreenDeferred} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreenDeferred} options={{ headerShown: true }} />
      <Stack.Screen name="ProgramEndCheck" component={ProgramEndCheckScreenDeferred} />
      <Stack.Screen name="ProgramComplete" component={ProgramCompleteScreenDeferred} />
      <Stack.Screen name="ExerciseDecisionHistory" component={ExerciseDecisionHistoryScreenDeferred} />
    </Stack.Navigator>
  );
}
