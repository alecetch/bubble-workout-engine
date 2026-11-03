import React from "react";
import { StyleSheet, Text } from "react-native";
import { YearShareFrame } from "./YearShareFrame";
import { colors } from "../../theme/colors";

export type ClubShareCardProps = { tier: number; year: number; count: number };
export function ClubShareCard({ tier, year, count }: ClubShareCardProps): React.JSX.Element {
  return <YearShareFrame>
    <Text style={styles.club} allowFontScaling={false}>CLUB {tier}</Text>
    <Text style={styles.year} allowFontScaling={false}>{year}</Text>
    <Text style={styles.count} allowFontScaling={false}>{count} days</Text>
  </YearShareFrame>;
}
const styles = StyleSheet.create({
  club: { color: colors.accent, fontSize: 52, fontWeight: "800", textAlign: "center" },
  year: { color: colors.textPrimary, fontSize: 40, fontWeight: "700" },
  count: { color: colors.textSecondary, fontSize: 26 },
});
