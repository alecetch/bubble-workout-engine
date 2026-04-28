import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { PressableScale } from "../../components/interaction/PressableScale";
import { usePhysiqueMilestones } from "../../api/hooks";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const MILESTONE_CATALOGUE = [
  { slug: "first_scan", title: "First scan complete", unlockCondition: "Complete your first premium scan" },
  { slug: "three_week_streak", title: "3-week streak", unlockCondition: "Submit 3 weekly scans in a row" },
  { slug: "six_week_streak", title: "6-week streak", unlockCondition: "Submit 6 weekly scans in a row" },
  { slug: "twelve_week_streak", title: "12-week streak", unlockCondition: "Submit 12 weekly scans in a row" },
  { slug: "score_70", title: "Physique Score 70+", unlockCondition: "Reach a score of 70 or higher" },
  { slug: "score_80", title: "Physique Score 80+", unlockCondition: "Reach a score of 80 or higher" },
  { slug: "score_90", title: "Physique Score 90+", unlockCondition: "Reach a score of 90 or higher" },
  { slug: "biggest_weekly_gain", title: "Biggest weekly gain", unlockCondition: "Set your best week-on-week improvement" },
  { slug: "region_peak_chest", title: "Chest personal best", unlockCondition: "Beat your previous chest score" },
  { slug: "region_peak_shoulders", title: "Shoulders personal best", unlockCondition: "Beat your previous shoulders score" },
  { slug: "region_peak_upper_back", title: "Upper back personal best", unlockCondition: "Beat your previous upper-back score" },
  { slug: "region_peak_arms", title: "Arms personal best", unlockCondition: "Beat your previous arms score" },
  { slug: "region_peak_core", title: "Core personal best", unlockCondition: "Beat your previous core score" },
  { slug: "region_peak_quads", title: "Quads personal best", unlockCondition: "Beat your previous quads score" },
  { slug: "region_peak_glutes", title: "Glutes personal best", unlockCondition: "Beat your previous glutes score" },
  { slug: "region_peak_hamstrings", title: "Hamstrings personal best", unlockCondition: "Beat your previous hamstrings score" },
  { slug: "region_peak_calves", title: "Calves personal best", unlockCondition: "Beat your previous calves score" },
  { slug: "full_body_improvement", title: "Full-body improvement", unlockCondition: "Improve every visible region from your prior scan" },
  { slug: "ten_scans", title: "10 scans completed", unlockCondition: "Finish 10 premium scans" },
];

export function PhysiqueMilestonesScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const milestonesQuery = usePhysiqueMilestones();

  if (milestonesQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (
    milestonesQuery.error &&
    typeof milestonesQuery.error === "object" &&
    "code" in milestonesQuery.error &&
    milestonesQuery.error.code === "premium_required"
  ) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Physique Milestones</Text>
        <Text style={styles.cardBody}>Premium is required to unlock and view milestone history.</Text>
        <PressableScale
          style={styles.upgradeButton}
          onPress={() => {
            const parent = navigation.getParent() as any;
            parent?.navigate?.("HomeTab", { screen: "Paywall" });
          }}
        >
          <Text style={styles.upgradeLabel}>Upgrade to Premium</Text>
        </PressableScale>
      </View>
    );
  }

  const achievedMap = new Map(
    (milestonesQuery.data?.milestones ?? []).map((item) => [item.milestone_slug, item.achieved_at]),
  );

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={MILESTONE_CATALOGUE}
      keyExtractor={(item) => item.slug}
      ListHeaderComponent={
        <View>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Physique Milestones</Text>
        </View>
      }
      renderItem={({ item }) => {
        const achievedAt = achievedMap.get(item.slug) ?? null;
        return (
          <View style={[styles.card, achievedAt ? styles.cardAchieved : styles.cardLocked]}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>
              {achievedAt
                ? `Unlocked on ${new Date(achievedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                : item.unlockCondition}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  backLabel: {
    color: colors.accent,
    ...typography.body,
    fontWeight: "600",
  },
  title: {
    color: colors.textPrimary,
    ...typography.h1,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  cardAchieved: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.35)",
  },
  cardLocked: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  cardTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  cardBody: {
    color: colors.textSecondary,
    ...typography.body,
  },
  upgradeButton: {
    minHeight: 46,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  upgradeLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
});
