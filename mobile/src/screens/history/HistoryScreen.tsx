import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  useExerciseHistory,
  useExerciseSearch,
  useHistoryOverview,
  useHistoryPersonalRecords,
  useHistoryPrograms,
  useHistoryTimeline,
} from "../../api/hooks";
import type { ExerciseSearchItem, HistoryTimelineItem } from "../../api/history";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

function formatDateLabel(isoDate: string): string {
  if (!isoDate) return "Unknown date";
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatSignedPercent(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "n/a";
  const numberValue = value as number;
  const sign = numberValue > 0 ? "+" : "";
  return `${sign}${(numberValue * 100).toFixed(1)}%`;
}

function formatSignedNumber(value: number | null | undefined, unit = ""): string {
  if (!Number.isFinite(value)) return "n/a";
  const numberValue = value as number;
  const sign = numberValue > 0 ? "+" : "";
  return `${sign}${numberValue.toFixed(1)}${unit}`;
}

function formatHours(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 10) return value.toFixed(0);
  return value.toFixed(1);
}

function formatKg(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "n/a";
  const numeric = value as number;
  if (Number.isInteger(numeric)) return `${numeric} kg`;
  return `${numeric.toFixed(1)} kg`;
}

function HeroMediaThumb({
  uri,
  compact = false,
}: {
  uri: string | null;
  compact?: boolean;
}): React.JSX.Element {
  const thumbStyle = compact ? styles.mediaThumbCompact : styles.mediaThumbLarge;

  if (!uri) {
    return (
      <View style={[thumbStyle, styles.mediaThumbPlaceholder]}>
        <Text style={styles.mediaPlaceholderLabel}>No Media</Text>
      </View>
    );
  }

  return <Image source={{ uri }} style={thumbStyle} />;
}

function Sparkline({ points }: { points: Array<number | null> }): React.JSX.Element | null {
  const values = points.filter((value): value is number => Number.isFinite(value));
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  return (
    <View style={styles.sparklineWrap}>
      {points.map((value, index) => {
        const heightPercent = Number.isFinite(value)
          ? 20 + (((value as number) - min) / range) * 80
          : 10;
        return (
          <View
            key={`spark-${index}`}
            style={[
              styles.sparkBar,
              {
                height: `${Math.round(heightPercent)}%`,
                opacity: Number.isFinite(value) ? 1 : 0.35,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function TimelineRow({ item }: { item: HistoryTimelineItem }): React.JSX.Element {
  return (
    <View style={styles.timelineCard}>
      <HeroMediaThumb uri={item.heroMediaId} compact />
      <View style={styles.timelineContent}>
        <Text style={styles.timelineDate}>{formatDateLabel(item.scheduledDate)}</Text>
        <Text style={styles.timelineLabel}>{item.dayLabel || "Session"}</Text>
        <Text style={styles.timelineMeta}>{item.durationMins} mins</Text>
        {item.highlight ? (
          <Text style={styles.timelineHighlight}>
            Max {item.highlight.value}kg - {item.highlight.exerciseName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ExerciseResultRow({
  item,
  onPress,
}: {
  item: ExerciseSearchItem;
  onPress: (item: ExerciseSearchItem) => void;
}): React.JSX.Element {
  return (
    <PressableScale style={styles.exerciseResultRow} onPress={() => onPress(item)}>
      <Text style={styles.exerciseResultName}>{item.name}</Text>
    </PressableScale>
  );
}

export function HistoryScreen(): React.JSX.Element {
  const queryClient = useQueryClient();
  const onboardingUserId = useOnboardingStore((state) => state.userId);
  const sessionUserId = useSessionStore((state) => state.userId);
  const bubbleUserId = sessionUserId ?? onboardingUserId ?? undefined;

  const overviewQuery = useHistoryOverview(bubbleUserId);
  const programsQuery = useHistoryPrograms(10, bubbleUserId);
  const personalRecordsQuery = useHistoryPersonalRecords(20, bubbleUserId);
  const timelineQuery = useHistoryTimeline(40, bubbleUserId);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState("");
  const [selectedExercise, setSelectedExercise] = React.useState<ExerciseSearchItem | null>(null);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  const exerciseSearchQuery = useExerciseSearch(debouncedSearchTerm, bubbleUserId);
  const exerciseHistoryQuery = useExerciseHistory(selectedExercise?.exerciseId ?? null, bubbleUserId);

  const overview = overviewQuery.data;
  const programs = programsQuery.data ?? [];
  const personalRecords = personalRecordsQuery.data ?? [];
  const exerciseSearchResults = (exerciseSearchQuery.data ?? []).slice(0, 20);

  const timelineItems = React.useMemo(() => {
    const seen = new Set<string>();
    const flattened = (timelineQuery.data?.pages ?? []).flatMap((page) => page.items);
    return flattened.filter((item) => {
      if (!item.programDayId || seen.has(item.programDayId)) return false;
      seen.add(item.programDayId);
      return true;
    });
  }, [timelineQuery.data]);

  const onRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Reset the infinite timeline query first so it restarts from page 1,
      // then refetch the other queries in parallel.
      await queryClient.resetQueries({ queryKey: queryKeys.historyTimeline, exact: true });
      await Promise.all([
        overviewQuery.refetch(),
        programsQuery.refetch(),
        personalRecordsQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [overviewQuery, programsQuery, personalRecordsQuery, queryClient]);

  const onEndReached = React.useCallback(() => {
    if (!timelineQuery.hasNextPage || timelineQuery.isFetchingNextPage) return;
    void timelineQuery.fetchNextPage();
  }, [timelineQuery]);

  const isInitialLoading =
    (overviewQuery.isLoading && !overview) ||
    (programsQuery.isLoading && programs.length === 0) ||
    (timelineQuery.isLoading && timelineItems.length === 0);

  const hasError =
    overviewQuery.isError || programsQuery.isError || timelineQuery.isError || personalRecordsQuery.isError;

  const metricCards = [
    {
      label: "Strength 28d",
      value: formatSignedPercent(overview?.strengthTrend28d.value),
      delta: formatSignedNumber(overview?.strengthTrend28d.delta, "kg"),
    },
    {
      label: "Volume 28d",
      value: formatSignedPercent(overview?.volumeTrend28d.value),
      delta: formatSignedNumber(overview?.volumeTrend28d.delta, "kg"),
    },
    {
      label: "Consistency 30d",
      value: formatSignedPercent(overview?.consistency30d.value),
      delta: formatSignedPercent(overview?.consistency30d.delta),
    },
    {
      label: "Weekly Change",
      value: formatSignedPercent(overview?.consistency30d.delta),
      delta: "vs prior window",
    },
  ];

  const listHeader = (
    <View style={styles.listHeader}>
      <Text style={styles.screenTitle}>Training History</Text>

      <View style={styles.heroCard}>
        <View style={styles.heroStatBlock}>
          <Text style={styles.heroStatValue}>{overview?.sessionsCompleted ?? 0}</Text>
          <Text style={styles.heroStatLabel}>Sessions Completed</Text>
        </View>
        <View style={styles.heroStatRow}>
          <View style={styles.heroStatMini}>
            <Text style={styles.heroStatMiniValue}>{formatHours(overview?.trainingHoursCompleted ?? 0)}</Text>
            <Text style={styles.heroStatMiniLabel}>Training Hours</Text>
          </View>
          <View style={styles.heroStatMini}>
            <Text style={styles.heroStatMiniValue}>{overview?.currentStreakDays ?? 0}</Text>
            <Text style={styles.heroStatMiniLabel}>Current Streak</Text>
          </View>
          <View style={styles.heroStatMini}>
            <Text style={styles.heroStatMiniValue}>{overview?.programsCompleted ?? 0}</Text>
            <Text style={styles.heroStatMiniLabel}>Programs Done</Text>
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsStrip}>
        {metricCards.map((metric) => (
          <View key={metric.label} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
            <Text style={styles.metricDelta}>{metric.delta}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.sectionHeaderWrap}>
        <Text style={styles.sectionTitle}>Programs</Text>
      </View>
      {programs.length > 0 ? (
        <FlatList
          data={programs}
          keyExtractor={(item) => item.programId}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.programsList}
          renderItem={({ item }) => (
            <View style={styles.programCard}>
              <HeroMediaThumb uri={item.heroMediaId} />
              <Text style={styles.programTitle} numberOfLines={2}>
                {item.programTitle}
              </Text>
              <Text style={styles.programMeta}>{formatDateLabel(item.startDate)}</Text>
              <Text style={styles.programMeta}>Completion {Math.round(item.completionRatio * 100)}%</Text>
            </View>
          )}
        />
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>No completed programs yet.</Text>
        </View>
      )}

      <View style={styles.sectionHeaderWrap}>
        <Text style={styles.sectionTitle}>Timeline</Text>
      </View>
    </View>
  );

  const listFooter = (
    <View style={styles.listFooter}>
      <View style={styles.sectionHeaderWrap}>
        <Text style={styles.sectionTitle}>Personal Records</Text>
      </View>
      {personalRecords.length > 0 ? (
        <View style={styles.personalRecordsWrap}>
          {personalRecords.map((record) => (
            <View key={`${record.exerciseId}:${record.programDayId}`} style={styles.personalRecordRow}>
              <View style={styles.personalRecordMain}>
                <Text style={styles.personalRecordName}>{record.exerciseName}</Text>
                <Text style={styles.personalRecordDate}>{formatDateLabel(record.date)}</Text>
              </View>
              <Text style={styles.personalRecordValue}>{record.value} kg</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>No personal records yet.</Text>
        </View>
      )}

      <View style={styles.sectionHeaderWrap}>
        <Text style={styles.sectionTitle}>Exercise Progress</Text>
      </View>
      <View style={styles.exerciseExplorerCard}>
        <TextInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search exercises"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.exerciseInput}
        />

        {debouncedSearchTerm.length < 2 ? (
          <Text style={styles.exerciseExplorerHint}>Search exercises</Text>
        ) : exerciseSearchQuery.isLoading ? (
          <View style={styles.exerciseSearchLoading}>
            <ActivityIndicator color={colors.accent} size="small" />
          </View>
        ) : exerciseSearchResults.length === 0 ? (
          <Text style={styles.exerciseExplorerHint}>No exercises found</Text>
        ) : (
          <View style={styles.exerciseResultsWrap}>
            {exerciseSearchResults.map((item) => (
              <ExerciseResultRow
                key={item.exerciseId}
                item={item}
                onPress={(selected) => {
                  Keyboard.dismiss();
                  setSelectedExercise(selected);
                }}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );

  if (isInitialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.subtitle}>Loading history...</Text>
      </View>
    );
  }

  if (hasError && !overview && timelineItems.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Unable to load history</Text>
        <Text style={styles.subtitle}>Pull to refresh or try again.</Text>
      </View>
    );
  }

  const closeExplorer = (): void => {
    setSelectedExercise(null);
  };

  const historySeries = exerciseHistoryQuery.data?.series ?? [];
  const historySummary = exerciseHistoryQuery.data?.summary;

  return (
    <>
      <FlatList
        style={styles.root}
        contentContainerStyle={styles.content}
        data={timelineItems}
        keyExtractor={(item) => item.programDayId}
        renderItem={({ item }) => <TimelineRow item={item} />}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No completed sessions yet.</Text>
          </View>
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void onRefresh()} tintColor={colors.accent} />}
        ListFooterComponentStyle={styles.footerSpacing}
      />

      <Modal transparent animationType="fade" visible={Boolean(selectedExercise)} onRequestClose={closeExplorer}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeExplorer} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{selectedExercise?.name ?? "Exercise"}</Text>
              <PressableScale style={styles.modalCloseButton} onPress={closeExplorer}>
                <Text style={styles.modalCloseLabel}>Close</Text>
              </PressableScale>
            </View>

            {exerciseHistoryQuery.isLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator color={colors.accent} size="small" />
              </View>
            ) : exerciseHistoryQuery.isError ? (
              <Text style={styles.modalHintText}>Unable to load exercise history.</Text>
            ) : historySeries.length === 0 ? (
              <Text style={styles.modalHintText}>No history yet for this exercise</Text>
            ) : (
              <View style={styles.modalBody}>
                <View style={styles.exerciseSummaryGrid}>
                  <View style={styles.exerciseSummaryStat}>
                    <Text style={styles.exerciseSummaryValue}>{formatKg(historySummary?.bestWeightKg)}</Text>
                    <Text style={styles.exerciseSummaryLabel}>Best Weight</Text>
                  </View>
                  <View style={styles.exerciseSummaryStat}>
                    <Text style={styles.exerciseSummaryValue}>
                      {historySummary?.lastPerformed ? formatDateLabel(historySummary.lastPerformed) : "n/a"}
                    </Text>
                    <Text style={styles.exerciseSummaryLabel}>Last Performed</Text>
                  </View>
                  <View style={styles.exerciseSummaryStat}>
                    <Text style={styles.exerciseSummaryValue}>{historySummary?.sessionsCount ?? 0}</Text>
                    <Text style={styles.exerciseSummaryLabel}>Sessions</Text>
                  </View>
                </View>

                <Sparkline points={historySeries.map((point) => point.topWeightKg)} />

                <View style={styles.exerciseSeriesList}>
                  {historySeries.map((point) => (
                    <View key={point.date} style={styles.exerciseSeriesRow}>
                      <Text style={styles.exerciseSeriesDate}>{formatDateLabel(point.date)}</Text>
                      <Text style={styles.exerciseSeriesValue}>
                        {point.topWeightKg == null ? "n/a" : formatKg(point.topWeightKg)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  listHeader: {
    gap: spacing.md,
  },
  listFooter: {
    gap: spacing.md,
  },
  footerSpacing: {
    paddingBottom: spacing.xxl,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  screenTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  heroCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  heroStatBlock: {
    gap: spacing.xs,
  },
  heroStatValue: {
    color: colors.textPrimary,
    ...typography.h1,
  },
  heroStatLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  heroStatRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  heroStatMini: {
    flex: 1,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  heroStatMiniValue: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  heroStatMiniLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  metricsStrip: {
    gap: spacing.sm,
  },
  metricCard: {
    width: 150,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  metricLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  metricValue: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  metricDelta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  sectionHeaderWrap: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  programsList: {
    gap: spacing.sm,
  },
  programCard: {
    width: 210,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  programTitle: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  programMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  mediaThumbLarge: {
    width: "100%",
    height: 80,
    borderRadius: radii.card,
    backgroundColor: colors.card,
  },
  mediaThumbCompact: {
    width: 88,
    height: 72,
    borderRadius: radii.card,
    backgroundColor: colors.card,
  },
  mediaThumbPlaceholder: {
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaPlaceholderLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  timelineCard: {
    flexDirection: "row",
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  timelineContent: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  timelineDate: {
    color: colors.textSecondary,
    ...typography.small,
  },
  timelineLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  timelineMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  timelineHighlight: {
    color: colors.textPrimary,
    ...typography.small,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  emptyCardText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  personalRecordsWrap: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  personalRecordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  personalRecordMain: {
    flex: 1,
    gap: 2,
    paddingRight: spacing.sm,
  },
  personalRecordName: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  personalRecordDate: {
    color: colors.textSecondary,
    ...typography.small,
  },
  personalRecordValue: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  exerciseExplorerCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  exerciseInput: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  exerciseExplorerHint: {
    color: colors.textSecondary,
    ...typography.body,
  },
  exerciseSearchLoading: {
    minHeight: 36,
    justifyContent: "center",
  },
  exerciseResultsWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    overflow: "hidden",
  },
  exerciseResultRow: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseResultName: {
    color: colors.textPrimary,
    ...typography.body,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
    maxHeight: "78%",
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  modalTitle: {
    color: colors.textPrimary,
    ...typography.h3,
    flex: 1,
  },
  modalCloseButton: {
    minHeight: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  modalCloseLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  modalLoadingWrap: {
    minHeight: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHintText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  modalBody: {
    gap: spacing.sm,
  },
  exerciseSummaryGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  exerciseSummaryStat: {
    flex: 1,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  exerciseSummaryValue: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  exerciseSummaryLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  sparklineWrap: {
    height: 46,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sparkBar: {
    flex: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  exerciseSeriesList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    overflow: "hidden",
  },
  exerciseSeriesRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseSeriesDate: {
    color: colors.textSecondary,
    ...typography.small,
  },
  exerciseSeriesValue: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
});
