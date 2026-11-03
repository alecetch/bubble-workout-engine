import React from "react";
import { StyleSheet, Text } from "react-native";
import { YearShareFrame } from "./YearShareFrame";
import { colors } from "../../theme/colors";

export type MilestoneShareCardProps = { count: number; year: number; isTarget?: boolean };
export function MilestoneShareCard({ count, year, isTarget = false }: MilestoneShareCardProps): React.JSX.Element {
  return <YearShareFrame>
    <Text style={styles.number} allowFontScaling={false}>{count}</Text>
    <Text style={styles.label} allowFontScaling={false}>{isTarget ? `I'M IN FOR ${year}` : "TRAINING DAYS"}</Text>
    {!isTarget ? <Text style={styles.year} allowFontScaling={false}>{year}</Text> : null}
  </YearShareFrame>;
}
const styles = StyleSheet.create({
  number: { color: colors.accent, fontSize: 112, lineHeight: 132, fontWeight: "800", letterSpacing: -5 },
  label: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", textAlign: "center", letterSpacing: 1 },
  year: { color: colors.textSecondary, fontSize: 28 },
});
