import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { YearShareFrame } from "./YearShareFrame";
import { YearHeatmap } from "../history/YearHeatmap";
import { colors } from "../../theme/colors";

export type YearHeatmapShareCardProps = { year: number; count: number; trainingDates: string[]; todayLocal: string; windowStart?: string };
export function YearHeatmapShareCard({ year, count, trainingDates, todayLocal, windowStart }: YearHeatmapShareCardProps): React.JSX.Element {
  return <YearShareFrame>
    <View style={styles.heading}><Text style={styles.year} allowFontScaling={false}>{year}</Text>
      <Text style={styles.count} allowFontScaling={false}>{count} TRAINING DAYS</Text></View>
    <YearHeatmap year={year} trainingDates={trainingDates} todayLocal={todayLocal} windowStart={windowStart} presentation="share" />
  </YearShareFrame>;
}
const styles = StyleSheet.create({
  heading: { gap: 4, alignItems: "center" },
  year: { color: colors.accent, fontSize: 34, fontWeight: "800" },
  count: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", letterSpacing: 1 },
});
