import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  useHistoryPrograms,
  useHistoryTimeline,
  useLoggedExercisesSearch,
  usePrsFeed,
  useSessionHistoryMetrics,
} from "../../api/hooks";
import type { HistoryTimelineItem, LoggedExerciseItem } from "../../api/history";
import type { HistoryStackParamList } from "../../navigation/HistoryStackNavigator";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type HistoryScreenNavProp = NativeStackNavigationProp<HistoryStackParamList, "HistoryMain">;

function formatDateLabel(isoDate: string): string {
  if (!isoDate) return "Unknown date";
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

function TimelineRow({
  item,
  onPressExercise,
}: {
  item: HistoryTimelineItem;
  onPressExercise?: (exerciseId: string, exerciseName: string) => void;
}): React.JSX.Element {
  return (
    <View style={styles.timelineCard}>
      <HeroMediaThumb uri={item.heroMediaId} compact />
      <View style={styles.timelineContent}>
        <Text style={styles.timelineDate}>{formatDateLabel(item.scheduledDate)}</Text>
        <Text style={styles.timelineLabel}>{item.dayLabel || "Session"}</Text>
        <Text style={styles.timelineMeta}>{item.durationMins} mins</Text>
        {item.highlight ? (
          <PressableScale
            onPress={
              item.highlight.exerciseId && onPressExercise
                ? () => onPressExercise(item.highlight!.exerciseId, item.highlight!.exerciseName)
                : undefined
            }
            disabled={!item.highlight.exerciseId || !onPressExercise}
          >
            <Text style={styles.timelineHighlight}>
              Max {item.highlight.value}kg - {item.highlight.exerciseName}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

function ExerciseResultRow({
  item,
  onPress,
}: {
  item: LoggedExerciseItem;
  onPress: (item: LoggedExerciseItem) => void;
}): React.JSX.Element {
  return (
    <PressableScale style={styles.exerciseResultRow} onPress={() => onPress(item)}>
      <Text style={styles.exerciseResultName}>{item.exerciseName}</Text>
    </PressableScale>
  );
}

export function HistoryScreen(): React.JSX.Element {
  const navigation = useNavigation<HistoryScreenNavProp>();
  const queryClient = useQueryClient();
  const onboardingUserId = useOnboardingStore((state) => state.userId);
  const sessionUserId = useSessionStore((state) => state.userId);
  const userId = sessionUserId ?? onboardingUserId ?? undefined;

  const metricsQuery = useSessionHistoryMetrics(userId);
  const prsFeedQuery = usePrsFeed(userId);
  const programsQuery = useHistoryPrograms(10, userId);
  const timelineQuery = useHistoryTimeline(40, userId);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState("");

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  const exerciseSearchQuery = useLoggedExercisesSearch(debouncedSearchTerm, userId);

  const metrics = metricsQuery.data;
  const prsFeed = prsFeedQuery.data;
  const programs = programsQuery.data ?? [];
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
      await queryClient.resetQueries({ queryKey: queryKeys.historyTimeline });
      await Promise.all([
        metricsQuery.refetch(),
        programsQuery.refetch(),
        prsFeedQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [metricsQuery, programsQuery, prsFeedQuery, queryClient]);

  const onEndReached = React.useCallback(() => {
    if (!timelineQuery.hasNextPage || timelineQuery.isFetchingNextPage) return;
    void timelineQuery.fetchNextPage();
  }, [timelineQuery]);

  const isInitialLoading =
    (metricsQuery.isLoading && !metrics) ||
    (timelineQuery.isLoading && timelineItems.length === 0);

  const hasError =
    metricsQuery.isError || timelineQuery.isError || prsFeedQuery.isError;

  const prsTitle =
    prsFeed?.mode === "prs_28d"
      ? "Personal Records - last 28 days"
      : prsFeed?.mode === "prs_90d"
        ? "Personal Records - last 90 days"
        : prsFeed?.mode === "heaviest_28d"
          ? "Heaviest Lifts - last 28 days"
          : "Personal Records";

  const listHeader = (
    <View style={styles.listHeader}>
      <Text style={styles.screenTitle}>Training History</Text>

      <View style={styles.heroCard}>
        <View style={styles.heroStatBlock}>
          <Text style={styles.heroStatValue}>{metrics?.sessionsCount ?? 0}</Text>
          <Text style={styles.heroStatLabel}>Sessions Completed</Text>
        </View>
        <View style={styles.heroStatRow}>
          <View style={styles.heroStatMini}>
            <Text style={styles.heroStatMiniValue}>{metrics?.dayStreak ?? 0}</Text>
            <Text style={styles.heroStatMiniLabel}>Day Streak</Text>
          </View>
          <View style={styles.heroStatMini}>
            <Text style={styles.heroStatMiniValue}>{metrics?.programmesCompleted ?? 0}</Text>
            <Text style={styles.heroStatMiniLabel}>Programmes Completed</Text>
          </View>
        </View>
      </View>

      <PressableScale
        onPress={() => navigation.navigate("ProgressOverview")}
        style={styles.progressCard}
      >
        <Text style={styles.progressCardTitle}>Progress Overview</Text>
        <Text style={styles.progressCardSubtitle}>Volume trends & strength snapshots</Text>
      </PressableScale>

      <View style={styles.metricsGrid}>
        <View style={styles.metricsGridCard}>
          <Text style={styles.metricsGridLabel}>Consistency 28d</Text>
          <Text style={styles.metricsGridValue}>
            {metrics?.consistency28d
              ? `${metrics.consistency28d.completed}/${metrics.consistency28d.scheduled}`
              : "-"}
          </Text>
          <Text style={styles.metricsGridSub}>
            {`${Math.round((metrics?.consistency28d?.rate ?? 0) * 100)}% completion`}
          </Text>
        </View>

        <View style={styles.metricsGridCard}>
          <Text style={styles.metricsGridLabel}>Volume 28d</Text>
          <Text style={styles.metricsGridValue}>
            {metrics?.volume28d != null ? `${Math.round(metrics.volume28d)} kg` : "-"}
          </Text>
          <Text style={styles.metricsGridSub}>total volume</Text>
        </View>

        <View style={styles.metricsGridCard}>
          <Text style={styles.metricsGridLabel}>Strength Upper 28d</Text>
          <Text style={styles.metricsGridValue}>
            {metrics?.strengthUpper28d?.bestE1rmKg != null
              ? `${metrics.strengthUpper28d.bestE1rmKg.toFixed(1)} kg`
              : "-"}
          </Text>
          <Text style={styles.metricsGridSubLabel}>Best e1RM</Text>
          <Text style={styles.metricsGridSub}>{metrics?.strengthUpper28d?.exerciseName ?? "No upper data"}</Text>
          <Text style={styles.metricsGridTrend}>
            {metrics?.strengthUpper28d?.trendPct != null
              ? `${metrics.strengthUpper28d.trendPct >= 0 ? "+" : ""}${(metrics.strengthUpper28d.trendPct * 100).toFixed(1)}%`
              : "-"}
          </Text>
        </View>

        <View style={styles.metricsGridCard}>
          <Text style={styles.metricsGridLabel}>Strength Lower 28d</Text>
          <Text style={styles.metricsGridValue}>
            {metrics?.strengthLower28d?.bestE1rmKg != null
              ? `${metrics.strengthLower28d.bestE1rmKg.toFixed(1)} kg`
              : "-"}
          </Text>
          <Text style={styles.metricsGridSubLabel}>Best e1RM</Text>
          <Text style={styles.metricsGridSub}>{metrics?.strengthLower28d?.exerciseName ?? "No lower data"}</Text>
          <Text style={styles.metricsGridTrend}>
            {metrics?.strengthLower28d?.trendPct != null
              ? `${metrics.strengthLower28d.trendPct >= 0 ? "+" : ""}${(metrics.strengthLower28d.trendPct * 100).toFixed(1)}%`
              : "-"}
          </Text>
        </View>
      </View>

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
        <Text style={styles.sectionTitle}>{prsTitle}</Text>
      </View>
      {prsFeed?.mode === "heaviest_28d" ? (
        prsFeed.heaviest?.upper || prsFeed.heaviest?.lower ? (
          <View style={styles.personalRecordsWrap}>
            <PressableScale
              style={styles.prsFeedRow}
              onPress={() =>
                prsFeed.heaviest?.upper?.exerciseId
                  ? navigation.navigate("ExerciseTrend", {
                      exerciseId: prsFeed.heaviest.upper.exerciseId,
                      exerciseName: prsFeed.heaviest.upper.exerciseName,
                    })
                  : undefined
              }
              disabled={!prsFeed.heaviest?.upper?.exerciseId}
            >
              <View style={styles.personalRecordMain}>
                <Text style={styles.prsFeedName}>{prsFeed.heaviest?.upper?.exerciseName ?? "No upper data"}</Text>
                {prsFeed.heaviest?.upper ? (
                  <Text style={styles.prsFeedStats}>
                    {formatKg(prsFeed.heaviest.upper.weightKg)} x {prsFeed.heaviest.upper.repsCompleted} reps
                    {prsFeed.heaviest.upper.estimatedE1rmKg != null
                      ? ` | e1RM ${formatKg(prsFeed.heaviest.upper.estimatedE1rmKg)}`
                      : ""}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.prsFeedDate}>Upper</Text>
            </PressableScale>
            <PressableScale
              style={styles.prsFeedRow}
              onPress={() =>
                prsFeed.heaviest?.lower?.exerciseId
                  ? navigation.navigate("ExerciseTrend", {
                      exerciseId: prsFeed.heaviest.lower.exerciseId,
                      exerciseName: prsFeed.heaviest.lower.exerciseName,
                    })
                  : undefined
              }
              disabled={!prsFeed.heaviest?.lower?.exerciseId}
            >
              <View style={styles.personalRecordMain}>
                <Text style={styles.prsFeedName}>{prsFeed.heaviest?.lower?.exerciseName ?? "No lower data"}</Text>
                {prsFeed.heaviest?.lower ? (
                  <Text style={styles.prsFeedStats}>
                    {formatKg(prsFeed.heaviest.lower.weightKg)} x {prsFeed.heaviest.lower.repsCompleted} reps
                    {prsFeed.heaviest.lower.estimatedE1rmKg != null
                      ? ` | e1RM ${formatKg(prsFeed.heaviest.lower.estimatedE1rmKg)}`
                      : ""}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.prsFeedDate}>Lower</Text>
            </PressableScale>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>Complete workouts with logged weight to see records.</Text>
          </View>
        )
      ) : prsFeed?.rows && prsFeed.rows.length > 0 ? (
        <View style={styles.personalRecordsWrap}>
          {prsFeed.rows.map((row) => (
            <PressableScale
              key={`${row.exerciseId}:${row.date}`}
              style={styles.prsFeedRow}
              onPress={() =>
                navigation.navigate("ExerciseTrend", {
                  exerciseId: row.exerciseId,
                  exerciseName: row.exerciseName || row.exerciseId,
                })
              }
            >
              <View style={styles.personalRecordMain}>
                <Text style={styles.prsFeedName}>{row.exerciseName}</Text>
                <Text style={styles.prsFeedStats}>
                  {formatKg(row.weightKg)} x {row.repsCompleted} reps
                  {row.estimatedE1rmKg != null ? ` | e1RM ${formatKg(row.estimatedE1rmKg)}` : ""}
                </Text>
              </View>
              <Text style={styles.prsFeedDate}>{formatDateLabel(row.date)}</Text>
            </PressableScale>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>Complete workouts with logged weight to see records.</Text>
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
          textContentType="none"
          autoComplete="off"
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
                  setSearchTerm("");
                  navigation.navigate("ExerciseTrend", {
                    exerciseId: selected.exerciseId,
                    exerciseName: selected.exerciseName || selected.exerciseId,
                  });
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

  if (hasError && !metrics && timelineItems.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Unable to load history</Text>
        <Text style={styles.subtitle}>Pull to refresh or try again.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={timelineItems}
      keyExtractor={(item) => item.programDayId}
      renderItem={({ item }) => (
        <TimelineRow
          item={item}
          onPressExercise={(exerciseId, exerciseName) =>
            navigation.navigate("ExerciseTrend", { exerciseId, exerciseName })
          }
        />
      )}
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
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  progressCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  progressCardTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  progressCardSubtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  metricsGridCard: {
    width: "48%",
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  metricsGridLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  metricsGridValue: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  metricsGridSubLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  metricsGridSub: {
    color: colors.textSecondary,
    ...typography.small,
  },
  metricsGridTrend: {
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
  prsFeedName: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  prsFeedStats: {
    color: colors.textSecondary,
    ...typography.small,
  },
  prsFeedDate: {
    color: colors.textSecondary,
    ...typography.small,
  },
  prsFeedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
});
