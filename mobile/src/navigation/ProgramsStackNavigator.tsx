import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProgramHubScreen } from "../screens/program/ProgramHubScreen";
import { ProgramDashboardScreen } from "../screens/program/ProgramDashboardScreen";
import { ProgramDayScreen } from "../screens/program/ProgramDayScreen";
import { ExerciseDecisionHistoryScreen } from "../screens/program/ExerciseDecisionHistoryScreen";
import { ProgramCompleteScreen } from "../screens/program/ProgramCompleteScreen";
import { ProgramEndCheckScreen } from "../screens/program/ProgramEndCheckScreen";

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

export function ProgramsStackNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="ProgramHub"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="ProgramHub" component={ProgramHubScreen} />
      <Stack.Screen name="ProgramDashboard" component={ProgramDashboardScreen} />
      <Stack.Screen name="ProgramDay" component={ProgramDayScreen} />
      <Stack.Screen name="ProgramEndCheck" component={ProgramEndCheckScreen} />
      <Stack.Screen name="ProgramComplete" component={ProgramCompleteScreen} />
      <Stack.Screen name="ExerciseDecisionHistory" component={ExerciseDecisionHistoryScreen} />
    </Stack.Navigator>
  );
}
