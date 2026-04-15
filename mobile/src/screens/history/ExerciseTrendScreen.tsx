import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useExerciseHistory } from "../../api/hooks";
import type { ExerciseHistoryPoint, ExerciseHistoryWindow } from "../../api/history";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { HistoryStackParamList } from "../../navigation/HistoryStackNavigator";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<HistoryStackParamList, "ExerciseTrend">;

const WINDOWS: { label: string; value: ExerciseHistoryWindow }[] = [
  { label: "4W", value: "4w" },
  { label: "8W", value: "8w" },
  { label: "12W", value: "12w" },
  { label: "All", value: "all" },
];

const LEGEND_ITEMS = [
  { label: "Increase load", outcome: "increase_load" },
  { label: "Increase reps", outcome: "increase_reps" },
  { label: "Hold", outcome: "hold" },
  { label: "Deload", outcome: "deload_local" },
] as const;

const CHART_HEIGHT = 200;

function formatKg(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "n/a";
  const numeric = value as number;
  return Number.isInteger(numeric) ? `${numeric} kg` : `${numeric.toFixed(1)} kg`;
}

function decisionColor(outcome: string | null): string {
  switch (outcome) {
    case "increase_load":
    case "increase_reps":
      return colors.success;
    case "hold":
      return colors.textSecondary;
    case "deload_local":
      return colors.warning;
    default:
      return "transparent";
  }
}

function buildChartPath(
  series: ExerciseHistoryPoint[],
  chartWidth: number,
  chartHeight: number,
): { markers: { cx: number; cy: number; outcome: string | null }[] } {
  const valid = series.filter((point) => point.estimatedE1rmKg != null);
  if (valid.length === 0) return { markers: [] };

  const values = valid.map((point) => point.estimatedE1rmKg as number);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const padding = { top: 16, bottom: 16, left: 8, right: 8 };
  const plotW = chartWidth - padding.left - padding.right;
  const plotH = chartHeight - padding.top - padding.bottom;
  const toX = (index: number) => padding.left + (index / (valid.length - 1)) * plotW;
  const toY = (value: number) => padding.top + plotH - ((value - minVal) / range) * plotH;

  return {
    markers: valid.map((point, index) => ({
      cx: toX(index),
      cy: toY(point.estimatedE1rmKg as number),
      outcome: point.decisionOutcome,
    })),
  };
}

export function ExerciseTrendScreen({ route, navigation }: Props): React.JSX.Element {
  const { exerciseId, exerciseName } = route.params;
  const userId = useSessionStore((state) => state.userId) ?? undefined;
  const [window, setWindow] = useState<ExerciseHistoryWindow>("12w");
  const chartWidth = Dimensions.get("window").width - spacing.lg * 2;
  const { data, isLoading, isError, refetch } = useExerciseHistory(exerciseId, window, userId);
  const series = data?.series ?? [];
  const { markers } = useMemo(
    () => buildChartPath(series, chartWidth, CHART_HEIGHT),
    [chartWidth, series],
  );

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (isError && !data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Unable to load exercise trend</Text>
          <PressableScale style={styles.retryButton} onPress={() => void refetch()}>
            <Text style={styles.retryLabel}>Retry</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <PressableScale style={styles.iconButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </PressableScale>
          <Text style={styles.screenTitle}>{exerciseName}</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>Best E1RM</Text>
            <Text style={styles.summaryValue}>{formatKg(data?.summary.bestEstimatedE1rmKg)}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>Top Weight</Text>
            <Text style={styles.summaryValue}>{formatKg(data?.summary.bestWeightKg)}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>Sessions</Text>
            <Text style={styles.summaryValue}>{data?.summary.sessionsCount ?? 0}</Text>
          </View>
        </View>

        <View style={styles.pillRow}>
          {WINDOWS.map((item) => {
            const active = item.value === window;
            return (
              <PressableScale
                key={item.value}
                style={[styles.pill, active ? styles.pillActive : null]}
                onPress={() => setWindow(item.value)}
              >
                <Text style={[styles.pillLabel, active ? styles.pillLabelActive : null]}>{item.label}</Text>
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.chartCard}>
          {series.length === 0 ? (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyBody}>No data yet for this exercise.</Text>
            </View>
          ) : (
            <>
              <View style={[styles.chartCanvas, { width: chartWidth, height: CHART_HEIGHT }]}>
                {markers.map((marker, index) => {
                  const fill = decisionColor(marker.outcome);
                  return (
                    <View
                      key={index}
                      style={[
                        styles.chartMarker,
                        {
                          left: marker.cx - (fill !== "transparent" ? 5 : 3),
                          top: marker.cy - (fill !== "transparent" ? 5 : 3),
                          width: fill !== "transparent" ? 10 : 6,
                          height: fill !== "transparent" ? 10 : 6,
                          borderRadius: fill !== "transparent" ? 5 : 3,
                          backgroundColor: fill !== "transparent" ? fill : colors.accent,
                          opacity: fill !== "transparent" ? 1 : 0.5,
                        },
                      ]}
                    />
                  );
                })}
              </View>
              <Text style={styles.chartSummary}>
                {`${series.length} sessions logged. Best estimated 1RM: ${
                  data?.summary.bestEstimatedE1rmKg != null
                    ? formatKg(data.summary.bestEstimatedE1rmKg)
                    : "n/a"
                }.`}
              </Text>
            </>
          )}
        </View>

        <View style={styles.legendRow}>
          {LEGEND_ITEMS.map((item) => (
            <View key={item.outcome} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: decisionColor(item.outcome) }]} />
              <Text style={styles.legendLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.h2,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryChip: {
    flex: 1,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    alignItems: "center",
    gap: spacing.xs,
  },
  summaryLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  summaryValue: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
    textAlign: "center",
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pill: {
    minHeight: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  pillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pillLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  pillLabelActive: {
    color: colors.textPrimary,
  },
  chartCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chartCanvas: {
    position: "relative",
  },
  chartMarker: {
    position: "absolute",
  },
  emptyChart: {
    minHeight: CHART_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  chartSummary: {
    color: colors.textSecondary,
    ...typography.small,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  errorTitle: {
    color: colors.textPrimary,
    ...typography.h3,
    textAlign: "center",
  },
  emptyBody: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  retryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
});
