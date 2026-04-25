import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProgramHubScreen } from "../screens/program/ProgramHubScreen";

export type ProgramsStackParamList = {
  ProgramHub: undefined;
  ProgramDashboard: { programId?: string } | undefined;
  ProgramDay: { programDayId: string };
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
  console.log("[boot] ProgramsStack require ProgramDashboardScreen start");
  const mod = require("../screens/program/ProgramDashboardScreen") as typeof import("../screens/program/ProgramDashboardScreen");
  console.log("[boot] ProgramsStack require ProgramDashboardScreen success");
  return <mod.ProgramDashboardScreen {...props} />;
}

function ProgramDayScreenDeferred(
  props: any,
): React.JSX.Element {
  console.log("[boot] ProgramsStack require ProgramDayScreen start");
  const mod = require("../screens/program/ProgramDayScreen") as typeof import("../screens/program/ProgramDayScreen");
  console.log("[boot] ProgramsStack require ProgramDayScreen success");
  return <mod.ProgramDayScreen {...props} />;
}

function ProgramEndCheckScreenDeferred(
  props: any,
): React.JSX.Element {
  console.log("[boot] ProgramsStack require ProgramEndCheckScreen start");
  const mod = require("../screens/program/ProgramEndCheckScreen") as typeof import("../screens/program/ProgramEndCheckScreen");
  console.log("[boot] ProgramsStack require ProgramEndCheckScreen success");
  return <mod.ProgramEndCheckScreen {...props} />;
}

function ProgramCompleteScreenDeferred(
  props: any,
): React.JSX.Element {
  console.log("[boot] ProgramsStack require ProgramCompleteScreen start");
  const mod = require("../screens/program/ProgramCompleteScreen") as typeof import("../screens/program/ProgramCompleteScreen");
  console.log("[boot] ProgramsStack require ProgramCompleteScreen success");
  return <mod.ProgramCompleteScreen {...props} />;
}

function ExerciseDecisionHistoryScreenDeferred(
  props: any,
): React.JSX.Element {
  console.log("[boot] ProgramsStack require ExerciseDecisionHistoryScreen start");
  const mod = require("../screens/program/ExerciseDecisionHistoryScreen") as typeof import("../screens/program/ExerciseDecisionHistoryScreen");
  console.log("[boot] ProgramsStack require ExerciseDecisionHistoryScreen success");
  return <mod.ExerciseDecisionHistoryScreen {...props} />;
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
      <Stack.Screen name="ProgramEndCheck" component={ProgramEndCheckScreenDeferred} />
      <Stack.Screen name="ProgramComplete" component={ProgramCompleteScreenDeferred} />
      <Stack.Screen name="ExerciseDecisionHistory" component={ExerciseDecisionHistoryScreenDeferred} />
    </Stack.Navigator>
  );
}
