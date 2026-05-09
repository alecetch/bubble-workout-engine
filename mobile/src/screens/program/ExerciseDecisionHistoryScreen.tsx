import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fetchDecisionHistory, type DecisionHistoryItem } from "../../api/programViewer";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<ProgramsStackParamList, "ExerciseDecisionHistory">;

const PAGE_SIZE = 20;

const OUTCOME_CHIP_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  increase_load: { bg: "#052e16", text: colors.success, border: "#16a34a" },
  increase_reps: { bg: "#052e16", text: colors.success, border: "#16a34a" },
  increase_sets: { bg: "#052e16", text: colors.success, border: "#16a34a" },
  reduce_rest: { bg: "#0c1a4a", text: colors.accent, border: "#3b82f6" },
  hold: { bg: colors.surface, text: colors.textSecondary, border: colors.border },
  deload_local: { bg: "#451a03", text: colors.warning, border: "#d97706" },
};

const OUTCOME_CHIP_LABEL: Record<string, string> = {
  increase_load: "Load ↑",
  increase_reps: "Reps ↑",
  increase_sets: "Sets ↑",
  reduce_rest: "Rest ↓",
  hold: "Hold",
  deload_local: "Deload",
};

function formatShortDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function DecisionRow({ item }: { item: DecisionHistoryItem }): React.JSX.Element {
  const chipStyle = OUTCOME_CHIP_STYLE[item.outcome] ?? OUTCOME_CHIP_STYLE.hold;
  const chipLabel = OUTCOME_CHIP_LABEL[item.outcome] ?? item.outcome;
  const dateLabel = formatShortDate(item.scheduledDate);

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{item.displayLabel}</Text>
        <View style={[styles.outcomePill, { backgroundColor: chipStyle.bg, borderColor: chipStyle.border }]}>
          <Text style={[styles.outcomePillText, { color: chipStyle.text }]}>{chipLabel}</Text>
        </View>
      </View>
      {dateLabel ? <Text style={styles.rowDate}>{dateLabel}</Text> : null}
      {item.displayReason ? <Text style={styles.rowReason}>{item.displayReason}</Text> : null}
      {item.confidence ? (
        <Text style={styles.rowConfidence}>Confidence: {capitalize(item.confidence)}</Text>
      ) : null}
      <View style={styles.rowDivider} />
    </View>
  );
}

export function ExerciseDecisionHistoryScreen({ route, navigation }: Props): React.JSX.Element {
  const { programExerciseId, exerciseName } = route.params;
  const sessionUserId = useSessionStore((state) => state.userId);
  const onboardingUserId = useOnboardingStore((state) => state.userId);
  const userId = sessionUserId ?? onboardingUserId ?? undefined;

  const [decisions, setDecisions] = useState<DecisionHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDecisionHistory(programExerciseId, { userId, limit: PAGE_SIZE, offset: 0 })
      .then((response) => {
        if (cancelled) return;
        setDecisions(response.decisions);
        setTotal(response.totalDecisions);
        setOffset(response.decisions.length);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load decision history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [programExerciseId, userId]);

  const loadMore = useCallback(() => {
    if (loadingMore || decisions.length >= total) return;
    setLoadingMore(true);

    fetchDecisionHistory(programExerciseId, { userId, limit: PAGE_SIZE, offset })
      .then((response) => {
        setDecisions((current) => [...current, ...response.decisions]);
        setOffset((current) => current + response.decisions.length);
      })
      .catch(() => {
        // Keep the existing partial timeline visible.
      })
      .finally(() => setLoadingMore(false));
  }, [decisions.length, loadingMore, offset, programExerciseId, total, userId]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backLabel}>Back</Text>
        </PressableScale>
        <Text style={styles.title} numberOfLines={1}>
          {exerciseName}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : decisions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            No adaptation decisions yet. Keep logging sessions to unlock personalised progression.
          </Text>
        </View>
      ) : (
        <FlatList
          data={decisions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DecisionRow item={item} />}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator color={colors.accent} size="small" />
              </View>
            ) : decisions.length < total ? (
              <PressableScale onPress={loadMore} style={styles.loadMoreButton}>
                <Text style={styles.loadMoreText}>Load more</Text>
              </PressableScale>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    paddingRight: spacing.sm,
  },
  backLabel: {
    color: colors.accent,
    ...typography.body,
    fontWeight: "600",
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.h3,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 20,
    textAlign: "center",
  },
  errorText: {
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    marginBottom: spacing.md,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: 2,
  },
  rowLabel: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  outcomePill: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  outcomePillText: {
    ...typography.label,
    fontWeight: "700",
  },
  rowDate: {
    color: colors.textSecondary,
    ...typography.label,
    marginBottom: spacing.xs,
  },
  rowReason: {
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 18,
    marginTop: 2,
  },
  rowConfidence: {
    color: colors.textSecondary,
    ...typography.label,
    marginTop: spacing.xs,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
  },
  loadingMore: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  loadMoreButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  loadMoreText: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
});
