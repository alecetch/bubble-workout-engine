import React from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { getScan } from "../../api/physiqueScan";
import type { HistoryStackParamList } from "../../navigation/HistoryStackNavigator";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<HistoryStackParamList, "PhysiqueScanDetail">;

function formatRegionName(slug: string): string {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function PhysiqueScanDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const scanQuery = useQuery({
    queryKey: ["physiqueScanDetail", route.params.scanId],
    queryFn: () => getScan(route.params.scanId),
  });

  if (scanQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const scan = scanQuery.data?.scan;
  if (
    scanQuery.error &&
    typeof scanQuery.error === "object" &&
    "code" in scanQuery.error &&
    scanQuery.error.code === "premium_required"
  ) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Scan detail</Text>
        <Text style={styles.body}>Premium is required to view detailed physique scan results.</Text>
      </View>
    );
  }

  if (!scan) {
    return (
      <View style={styles.centered}>
        <Text style={styles.body}>Unable to load this scan.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backLabel}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Scan detail</Text>
      {scan.photo_url ? <Image source={{ uri: scan.photo_url }} style={styles.heroImage} /> : null}
      <View style={styles.card}>
        <Text style={styles.score}>{scan.physique_score.toFixed(1)}</Text>
        <Text style={styles.body}>Score on {new Date(scan.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Text>
      </View>
      {scan.ai_coaching_narrative ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>AI coaching</Text>
          <Text style={styles.body}>{scan.ai_coaching_narrative}</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Observations</Text>
        {scan.observations.map((item) => (
          <Text key={item} style={styles.body}>• {item}</Text>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Region breakdown</Text>
        {Object.entries(scan.region_scores).map(([slug, entry]) => (
          <View key={slug} style={styles.regionRow}>
            <Text style={styles.regionName}>{formatRegionName(slug)}</Text>
            <Text style={styles.regionValue}>
              {entry.confidence === "not_visible" ? "Not visible" : `${entry.score?.toFixed(1) ?? "-"}/10`}
            </Text>
          </View>
        ))}
      </View>
      {scan.comparison ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Comparison</Text>
          <Text style={styles.body}>{scan.comparison.narrative ?? `${scan.comparison.score_delta.toFixed(1)} • ${scan.comparison.trend}`}</Text>
        </View>
      ) : null}
    </ScrollView>
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
  },
  heroImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  score: {
    color: colors.textPrimary,
    fontSize: 40,
    fontWeight: "800",
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
  },
  regionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  regionName: {
    color: colors.textPrimary,
    ...typography.body,
  },
  regionValue: {
    color: colors.textSecondary,
    ...typography.body,
  },
});
