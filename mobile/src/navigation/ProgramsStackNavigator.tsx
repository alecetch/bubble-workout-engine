import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProgramDashboardScreen } from "../screens/program/ProgramDashboardScreen";
import { ProgramDayScreen } from "../screens/program/ProgramDayScreen";
import { ExerciseDecisionHistoryScreen } from "../screens/program/ExerciseDecisionHistoryScreen";

export type ProgramsStackParamList = {
  ProgramDashboard: { programId?: string } | undefined;
  ProgramDay: { programDayId: string };
  ExerciseDecisionHistory: {
    programExerciseId: string;
    exerciseName: string;
  };
};

const Stack = createNativeStackNavigator<ProgramsStackParamList>();

export function ProgramsStackNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="ProgramDashboard"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="ProgramDashboard" component={ProgramDashboardScreen} />
      <Stack.Screen name="ProgramDay" component={ProgramDayScreen} />
      <Stack.Screen name="ExerciseDecisionHistory" component={ExerciseDecisionHistoryScreen} />
    </Stack.Navigator>
  );
}
