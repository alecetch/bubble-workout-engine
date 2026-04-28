import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HistoryScreen } from "../screens/history/HistoryScreen";

export type HistoryStackParamList = {
  HistoryMain: undefined;
  ExerciseTrend: { exerciseId: string; exerciseName: string };
  ProgressOverview: undefined;
  PhysiqueCheckIn: undefined;
  PhysiqueIntelligence: undefined;
  PhysiqueHistory: undefined;
  PhysiqueMilestones: undefined;
  PhysiqueScanDetail: { scanId: string };
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
      <Stack.Screen
        name="PhysiqueIntelligence"
        getComponent={() => require("../screens/physique/PhysiqueIntelligenceScreen").PhysiqueIntelligenceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PhysiqueHistory"
        getComponent={() => require("../screens/physique/PhysiqueHistoryScreen").PhysiqueHistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PhysiqueMilestones"
        getComponent={() => require("../screens/physique/PhysiqueMilestonesScreen").PhysiqueMilestonesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PhysiqueScanDetail"
        getComponent={() => require("../screens/physique/PhysiqueScanDetail").PhysiqueScanDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
