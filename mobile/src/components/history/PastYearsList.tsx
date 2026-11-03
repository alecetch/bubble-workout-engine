import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { YearProgressResponse } from "../../api/yearProgress";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { PressableScale } from "../interaction/PressableScale";

type Props = { years: YearProgressResponse["years"]; currentYear: number;
  onShare?: (year: YearProgressResponse["years"][number]) => void; isSharing?: boolean };

export function PastYearsList({ years, currentYear, onShare, isSharing }: Props): React.JSX.Element | null {
  const past = years.filter(row => row.year < currentYear).sort((a, b) => b.year - a.year);
  if (!past.length) return null;
  return <View style={styles.section}>
    <Text style={styles.title}>Past years</Text>
    {past.map(row => <View key={row.year} style={styles.yearRow}><Text style={styles.row}>
      {`${row.year} · ${row.count}${row.best_club ? ` · ${row.best_club === 200 ? "200" : `Club ${row.best_club}`}` : ""}`}
    </Text>{row.best_club && onShare ? <PressableScale accessibilityLabel={`Share ${row.year} club`} disabled={isSharing} onPress={() => onShare(row)}>
      <Text style={styles.share}>Share</Text>
    </PressableScale> : null}</View>)}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { ...typography.h3, color: colors.textPrimary },
  row: { ...typography.body, color: colors.textSecondary },
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  share: { ...typography.body, color: colors.accent, padding: spacing.sm },
});
