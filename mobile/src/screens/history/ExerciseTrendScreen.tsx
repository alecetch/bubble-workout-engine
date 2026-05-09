import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
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
import { buildChartPath, formatShortDate } from "./chartUtils";

type Props = NativeStackScreenProps<HistoryStackParamList, "ExerciseTrend">;

const WINDOWS: { label: string; value: ExerciseHistoryWindow }[] = [
  { label: "4W", value: "4w" },
  { label: "8W", value: "8w" },
  { label: "12W", value: "12w" },
  { label: "All", value: "all" },
];

const LEGEND_ITEMS = [
  { label: "Increase", outcome: "increase_load" },
  { label: "Hold", outcome: "hold" },
  { label: "Deload", outcome: "deload_local" },
] as const;

const CHART_HEIGHT = 220;
const CHART_CARD_HORIZONTAL_PADDING = spacing.md * 2;

function shouldRenderAxisLabel(index: number, total: number): boolean {
  if (total <= 1) return true;
  if (index === 0 || index === total - 1) return true;
  return index % 2 === 0;
}

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

export function ExerciseTrendScreen({ route, navigation }: Props): React.JSX.Element {
  const { exerciseId, exerciseName } = route.params;
  const userId = useSessionStore((state) => state.userId) ?? undefined;
  const [window, setWindow] = useState<ExerciseHistoryWindow>("12w");
  const chartWidth = Dimensions.get("window").width - spacing.lg * 2 - CHART_CARD_HORIZONTAL_PADDING;
  const { data, isLoading, isError, refetch } = useExerciseHistory(exerciseId, window, userId);
  const series = data?.series ?? [];
  const { svgPath, markers, points, padding, plotH, minVal, maxVal } = useMemo(
    () => buildChartPath(series, chartWidth, CHART_HEIGHT),
    [chartWidth, series],
  );
  const axisLabels = useMemo(
    () =>
      points
        .map((point, index) => ({
          key: `xlabel-${index}`,
          label: formatShortDate(point.date),
          show: shouldRenderAxisLabel(index, points.length),
        }))
        .filter((item) => item.show),
    [points],
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
              <Svg width={chartWidth} height={CHART_HEIGHT}>
                <Line
                  x1={padding.left}
                  y1={padding.top}
                  x2={padding.left}
                  y2={padding.top + plotH}
                  stroke={colors.textSecondary}
                  strokeWidth={1.5}
                />
                <SvgText
                  x={padding.left - 4}
                  y={padding.top + 4}
                  fill={colors.textSecondary}
                  fontSize={10}
                  textAnchor="end"
                >
                  {`${maxVal.toFixed(0)} kg`}
                </SvgText>
                <SvgText
                  x={padding.left - 4}
                  y={padding.top + plotH}
                  fill={colors.textSecondary}
                  fontSize={10}
                  textAnchor="end"
                >
                  {`${minVal.toFixed(0)} kg`}
                </SvgText>
                <Line
                  x1={padding.left}
                  y1={padding.top + plotH}
                  x2={padding.left + (chartWidth - padding.left - padding.right)}
                  y2={padding.top + plotH}
                  stroke={colors.textSecondary}
                  strokeWidth={1.5}
                />

                {svgPath ? (
                  <Path
                    d={svgPath}
                    stroke={colors.accent}
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}

                {markers.map((marker, index) => {
                  const fill = decisionColor(marker.outcome);
                  if (fill === "transparent") {
                    if (markers.length === 1) {
                      return <Circle key={index} cx={marker.cx} cy={marker.cy} r={5} fill={colors.accent} />;
                    }
                    return null;
                  }
                  return <Circle key={index} cx={marker.cx} cy={marker.cy} r={5} fill={fill} />;
                })}
              </Svg>
              <View
                style={styles.axisLabelRow}
              >
                {axisLabels.map((item) => (
                  <Text key={item.key} style={styles.axisLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                ))}
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
  emptyChart: {
    minHeight: CHART_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  chartSummary: {
    color: colors.textSecondary,
    ...typography.small,
  },
  axisLabelRow: {
    width: "100%",
    minHeight: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 0,
    paddingLeft: spacing.xl,
    paddingRight: spacing.xs,
  },
  axisLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
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
