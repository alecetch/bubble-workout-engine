import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { YearProgressResponse } from "../../api/yearProgress";
import { SkeletonBlock } from "../feedback/SkeletonBlock";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { paceLine, proRatedNote } from "../../utils/yearCopy";

type Props = {
  progress?: YearProgressResponse;
  isLoading?: boolean;
  isError?: boolean;
  onRetry: () => void;
  onPress: () => void;
};

const CARD_HEIGHT = 200;
const RADIUS = 32;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function YearProgressCard({ progress, isLoading, isError, onRetry, onPress }: Props): React.JSX.Element {
  if (isLoading) return <SkeletonBlock height={CARD_HEIGHT} testID="year-progress-loading" />;
  if (isError || !progress?.ok) return (
    <View style={[styles.card, styles.error]} testID="year-progress-error">
      <Text style={styles.pace}>Couldn&apos;t load your year</Text>
      <PressableScale onPress={onRetry} style={styles.retry} accessibilityLabel="Retry loading your year">
        <Text style={styles.retryLabel}>Retry</Text>
      </PressableScale>
    </View>
  );
  const fraction = progress.target > 0 ? Math.min(1, Math.max(0, progress.count / progress.target)) : 0;
  const paceLabel = progress.pace_status === "on_pace" ? "on pace"
    : `${progress.pace_status === "ahead" ? Math.floor(progress.pace_delta) : Math.ceil(-progress.pace_delta)} ${progress.pace_status} of pace`;
  const note = proRatedNote(progress);
  return (
    <PressableScale onPress={onPress} style={styles.card} testID="year-progress-card"
      accessibilityLabel={`${progress.count} of ${progress.target} training days this year, ${paceLabel}`}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.details}>
        <View style={styles.row}>
          <View style={styles.countGroup}>
            <Text style={styles.count}>{progress.count}</Text>
            <Text style={styles.target}>of {progress.target}</Text>
          </View>
          <Svg width={76} height={76} viewBox="0 0 76 76">
            <Circle cx={38} cy={38} r={RADIUS} stroke={colors.border} strokeWidth={6} fill="none" />
            <Circle cx={38} cy={38} r={RADIUS} stroke={colors.accent} strokeWidth={6} fill="none"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`} strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              strokeLinecap="round" rotation={-90} origin="38, 38" />
          </Svg>
        </View>
        <Text style={styles.pace}>{paceLine(progress)}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: CARD_HEIGHT, width: "100%", padding: spacing.md, borderRadius: radii.card,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: "center" },
  details: { gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  countGroup: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: spacing.sm, flex: 1 },
  count: { ...typography.display, color: colors.textPrimary },
  target: { ...typography.body, color: colors.textSecondary },
  pace: { ...typography.small, color: colors.textPrimary },
  note: { ...typography.label, color: colors.textSecondary },
  error: { alignItems: "center", gap: spacing.sm },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
  retryLabel: { ...typography.body, color: colors.accent },
});
