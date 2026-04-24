import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HistoryScreen } from "../screens/history/HistoryScreen";

export type HistoryStackParamList = {
  HistoryMain: undefined;
  ExerciseTrend: { exerciseId: string; exerciseName: string };
  ProgressOverview: undefined;
  PhysiqueCheckIn: undefined;
};

const Stack = createNativeStackNavigator<HistoryStackParamList>();

export function HistoryStackNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="HistoryMain"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="HistoryMain" component={HistoryScreen} />
      <Stack.Screen
        name="ExerciseTrend"
        getComponent={() => require("../screens/history/ExerciseTrendScreen").ExerciseTrendScreen}
      />
      <Stack.Screen
        name="ProgressOverview"
        getComponent={() => require("../screens/history/ProgressOverviewScreen").ProgressOverviewScreen}
      />
      <Stack.Screen
        name="PhysiqueCheckIn"
        getComponent={() => require("../screens/physique/PhysiqueCheckInScreen").PhysiqueCheckInScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
