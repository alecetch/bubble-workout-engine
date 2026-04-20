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
import { useSessionHistoryMetrics } from "../../api/hooks";
import type { SessionHistoryStrengthRegion, WeeklyVolumePoint } from "../../api/history";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { HistoryStackParamList } from "../../navigation/HistoryStackNavigator";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<HistoryStackParamList, "ProgressOverview">;
type RegionKey = "full" | "upper" | "lower";

const REGIONS: { label: string; value: RegionKey }[] = [
  { label: "Full", value: "full" },
  { label: "Upper", value: "upper" },
  { label: "Lower", value: "lower" },
];

const CHART_HEIGHT = 180;
const LABEL_ROW_HEIGHT = 20;
const SCALE_GUTTER_WIDTH = 44;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatWeekLabel(weekStart: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekStart).slice(0, 10));
  if (!match) return weekStart.slice(0, 10) || "Week";

  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const month = MONTH_LABELS[monthIndex];
  if (!month || !Number.isFinite(day)) return weekStart.slice(0, 10) || "Week";

  return `${month} ${day}`;
}

function buildBarChart(
  data: WeeklyVolumePoint[],
  chartWidth: number,
  chartHeight: number,
): { bars: { x: number; y: number; w: number; h: number; label: string }[] } {
  if (data.length === 0) return { bars: [] };

  const padding = { top: 8, bottom: LABEL_ROW_HEIGHT + 4, left: SCALE_GUTTER_WIDTH, right: 8 };
  const plotW = chartWidth - padding.left - padding.right;
  const plotH = chartHeight - padding.top - padding.bottom;
  const maxVol = Math.max(...data.map((point) => point.volumeLoad), 1);
  const barGap = 4;
  const barW = Math.max(4, plotW / data.length - barGap);

  return {
    bars: data.map((point, index) => {
      const barH = (point.volumeLoad / maxVol) * plotH;
      const x = padding.left + index * (barW + barGap);
      const y = padding.top + plotH - barH;
      const label = formatWeekLabel(point.weekStart);
      return { x, y, w: barW, h: Math.max(2, barH), label };
    }),
  };
}

function StrengthCard({
  label,
  data,
  onPress,
}: {
  label: string;
  data: SessionHistoryStrengthRegion | null;
  onPress?: (exerciseId: string, exerciseName: string) => void;
}): React.JSX.Element {
  return (
    <PressableScale
      style={styles.strengthCard}
      onPress={data && onPress ? () => onPress(data.exerciseId, data.exerciseName) : undefined}
      disabled={!data || !onPress}
    >
      <Text style={styles.strengthCardRegion}>{label}</Text>
      {data ? (
        <>
          <Text style={styles.strengthCardExercise}>{data.exerciseName}</Text>
          <Text style={styles.strengthCardValue}>{data.bestE1rmKg.toFixed(1)} kg</Text>
          <Text style={styles.strengthCardSubLabel}>Best e1RM</Text>
          {data.trendPct != null ? (
            <Text
              style={[
                styles.strengthCardTrend,
                { color: data.trendPct >= 0 ? colors.success : colors.error },
              ]}
            >
              {data.trendPct >= 0 ? "+" : ""}
              {data.trendPct.toFixed(1)}%
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.strengthCardEmpty}>No data</Text>
      )}
    </PressableScale>
  );
}

export function ProgressOverviewScreen({ navigation }: Props): React.JSX.Element {
  const userId = useSessionStore((state) => state.userId) ?? undefined;
  const [region, setRegion] = useState<RegionKey>("upper");
  const chartWidth = Dimensions.get("window").width - spacing.lg * 2;
  const { data: metrics, isLoading, isError, refetch } = useSessionHistoryMetrics(userId);
  const seriesData = metrics?.weeklyVolumeByRegion8w?.[region] ?? [];
  const nonZeroSeriesData = useMemo(
    () => seriesData.filter((point) => point.volumeLoad > 0),
    [seriesData],
  );
  const peakWeek = Math.max(...nonZeroSeriesData.map((point) => point.volumeLoad), 0);
  const hasMeaningfulVolume = peakWeek > 0;
  const { bars } = useMemo(
    () => buildBarChart(hasMeaningfulVolume ? nonZeroSeriesData : [], chartWidth, CHART_HEIGHT),
    [chartWidth, hasMeaningfulVolume, nonZeroSeriesData],
  );

  if (isLoading && !metrics) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (isError && !metrics) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Unable to load progress overview</Text>
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
          <Text style={styles.screenTitle}>Progress Overview</Text>
        </View>

        <View style={styles.pillRow}>
          {REGIONS.map((item) => {
            const active = item.value === region;
            return (
              <PressableScale
                key={item.value}
                style={[styles.pill, active ? styles.pillActive : null]}
                onPress={() => setRegion(item.value)}
              >
                <Text style={[styles.pillLabel, active ? styles.pillLabelActive : null]}>{item.label}</Text>
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.chartCard}>
          {!hasMeaningfulVolume ? (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyBody}>No volume data for this region yet.</Text>
            </View>
          ) : (
            <>
              <View style={[styles.barChart, { width: chartWidth, height: CHART_HEIGHT }]}>
                <Text style={styles.chartScaleTop}>{peakWeek.toLocaleString()} kg</Text>
                <Text style={styles.chartScaleBottom}>0</Text>
                {bars.map((bar, index) => (
                  <View
                    key={`bar-${index}`}
                    style={[
                      styles.bar,
                      {
                        left: bar.x,
                        width: bar.w,
                        height: bar.h,
                        top: bar.y,
                      },
                    ]}
                  />
                ))}
                {bars.map((bar, index) =>
                  index % 2 === 0 ? (
                    <Text
                      key={`label-${index}`}
                      style={[
                        styles.barLabel,
                        {
                          left: bar.x - spacing.xs,
                          width: bar.w + spacing.sm,
                        },
                      ]}
                    >
                      {bar.label}
                    </Text>
                  ) : null,
                )}
              </View>
              <Text style={styles.chartSummary}>
                {`${nonZeroSeriesData.length} active weeks of data. Peak week: ${peakWeek.toLocaleString()} kg volume load.`}
              </Text>
            </>
          )}
        </View>

        <View style={styles.strengthRow}>
          <StrengthCard
            label="Upper Body"
            data={metrics?.strengthUpper28d ?? null}
            onPress={(exerciseId, exerciseName) =>
              navigation.navigate("ExerciseTrend", { exerciseId, exerciseName })
            }
          />
          <StrengthCard
            label="Lower Body"
            data={metrics?.strengthLower28d ?? null}
            onPress={(exerciseId, exerciseName) =>
              navigation.navigate("ExerciseTrend", { exerciseId, exerciseName })
            }
          />
        </View>

        <Text style={styles.sectionTitle}>Activity Stats</Text>
        <View style={styles.streakRow}>
          <View style={styles.streakChip}>
            <Text style={styles.streakValue}>{metrics?.dayStreak ?? 0}</Text>
            <Text style={styles.streakLabel}>Day streak</Text>
          </View>
          <View style={styles.streakChip}>
            <Text style={styles.streakValue}>{metrics?.consistency28d?.completed ?? 0}</Text>
            <Text style={styles.streakLabel}>Sessions (28d)</Text>
          </View>
          <View style={styles.streakChip}>
            <Text style={styles.streakValue}>
              {metrics ? `${Math.round(metrics.consistency28d.rate * 100)}%` : "-"}
            </Text>
            <Text style={styles.streakLabel}>Consistency</Text>
          </View>
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
    color: colors.textPrimary,
    ...typography.h2,
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
  barChart: {
    position: "relative",
  },
  bar: {
    position: "absolute",
    minHeight: 2,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: colors.accent,
  },
  chartScaleTop: {
    position: "absolute",
    left: 0,
    top: 4,
    width: SCALE_GUTTER_WIDTH - spacing.xs,
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: "right",
  },
  chartScaleBottom: {
    position: "absolute",
    left: 0,
    bottom: LABEL_ROW_HEIGHT - 2,
    width: SCALE_GUTTER_WIDTH - spacing.xs,
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: "right",
  },
  barLabel: {
    position: "absolute",
    bottom: 0,
    color: colors.textSecondary,
    fontSize: 9,
    textAlign: "center",
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
  strengthRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  strengthCard: {
    flex: 1,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  strengthCardRegion: {
    color: colors.textSecondary,
    ...typography.label,
  },
  strengthCardExercise: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  strengthCardValue: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  strengthCardSubLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  strengthCardTrend: {
    ...typography.small,
  },
  strengthCardEmpty: {
    color: colors.textSecondary,
    ...typography.body,
  },
  sectionTitle: {
    color: colors.textSecondary,
    ...typography.label,
  },
  streakRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  streakChip: {
    flex: 1,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    alignItems: "center",
    gap: spacing.xs,
  },
  streakValue: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  streakLabel: {
    color: colors.textSecondary,
    ...typography.label,
    textAlign: "center",
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
