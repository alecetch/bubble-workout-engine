import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { YearProgressResponse } from "../../api/yearProgress";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = { years: YearProgressResponse["years"]; currentYear: number };

export function PastYearsList({ years, currentYear }: Props): React.JSX.Element | null {
  const past = years.filter(row => row.year < currentYear).sort((a, b) => b.year - a.year);
  if (!past.length) return null;
  return <View style={styles.section}>
    <Text style={styles.title}>Past years</Text>
    {past.map(row => <Text key={row.year} style={styles.row}>
      {`${row.year} · ${row.count}${row.best_club ? ` · ${row.best_club === 200 ? "200" : `Club ${row.best_club}`}` : ""}`}
    </Text>)}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { ...typography.h3, color: colors.textPrimary },
  row: { ...typography.body, color: colors.textSecondary },
});
