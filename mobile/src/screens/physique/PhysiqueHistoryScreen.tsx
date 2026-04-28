import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { PressableScale } from "../../components/interaction/PressableScale";
import { usePhysiqueScans, usePhysiqueScanTrend } from "../../api/hooks";
import type { HistoryStackParamList } from "../../navigation/HistoryStackNavigator";
import { buildChartPath, formatShortDate } from "../history/chartUtils";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<HistoryStackParamList, "PhysiqueHistory">;
type Mode = "chart" | "photos";
type Range = "4W" | "12W" | "All";

const CHART_HEIGHT = 240;
const CHART_WIDTH = Dimensions.get("window").width - spacing.lg * 2 - spacing.md * 2;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function filterTrendByRange<T extends { submitted_at: string }>(items: T[], range: Range): T[] {
  if (range === "All") return items;
  const cutoffDays = range === "4W" ? 28 : 84;
  const cutoff = Date.now() - cutoffDays * 24 * 60 * 60 * 1000;
  return items.filter((item) => new Date(item.submitted_at).getTime() >= cutoff);
}

function toChartPoints(series: Array<{ submitted_at: string; physique_score?: number; score?: number }>) {
  return series.map((point) => ({
    date: point.submitted_at,
    estimatedE1rmKg: Number(point.physique_score ?? point.score ?? 0),
    topWeightKg: null,
    tonnage: null,
    topReps: null,
    decisionOutcome: null,
    decisionPrimaryLever: null,
  }));
}

export function PhysiqueHistoryScreen({ navigation }: Props): React.JSX.Element {
  const scansQuery = usePhysiqueScans(50);
  const trendQuery = usePhysiqueScanTrend();
  const [mode, setMode] = React.useState<Mode>("chart");
  const [range, setRange] = React.useState<Range>("12W");
  const [activeRegion, setActiveRegion] = React.useState<string | null>(null);

  if (scansQuery.isLoading || trendQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.body}>Loading physique history...</Text>
      </View>
    );
  }

  if (
    scansQuery.error &&
    typeof scansQuery.error === "object" &&
    "code" in scansQuery.error &&
    (scansQuery.error as { code?: string }).code === "premium_required"
  ) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Physique History</Text>
        <Text style={styles.body}>Premium unlocks score history, trend charts, and scan comparisons.</Text>
        <PressableScale
          style={styles.toggleChipActive}
          onPress={() => {
            const parent = navigation.getParent() as any;
            parent?.navigate?.("HomeTab", { screen: "Paywall" });
          }}
        >
          <Text style={styles.toggleLabelActive}>Upgrade to Premium</Text>
        </PressableScale>
      </View>
    );
  }

  const trend = filterTrendByRange(trendQuery.data?.trend ?? [], range);
  const regionTrends = trendQuery.data?.region_trends ?? {};
  const overlaySeries = activeRegion ? filterTrendByRange(regionTrends[activeRegion] ?? [], range) : [];

  const primaryLayout = buildChartPath(toChartPoints(trend), CHART_WIDTH, CHART_HEIGHT);
  const overlayLayout = buildChartPath(toChartPoints(overlaySeries), CHART_WIDTH, CHART_HEIGHT);

  const pts = primaryLayout.points;
  const xLabelPoints =
    pts.length <= 4
      ? pts
      : [0, 1, 2, 3].map((i) => pts[Math.round((i * (pts.length - 1)) / 3)]);

  const scans = scansQuery.data?.scans ?? [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backLabel}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Physique History</Text>

      <View style={styles.toggleRow}>
        {(["chart", "photos"] as const).map((value) => (
          <PressableScale
            key={value}
            style={[styles.toggleChip, mode === value && styles.toggleChipActive]}
            onPress={() => setMode(value)}
          >
            <Text style={[styles.toggleLabel, mode === value && styles.toggleLabelActive]}>
              {value === "chart" ? "Chart" : "Photos"}
            </Text>
          </PressableScale>
        ))}
      </View>

      {mode === "chart" ? (
        <View style={styles.card}>
          <View style={styles.rangeRow}>
            {(["4W", "12W", "All"] as const).map((value) => (
              <PressableScale
                key={value}
                style={[styles.rangeChip, range === value && styles.rangeChipActive]}
                onPress={() => setRange(value)}
              >
                <Text style={[styles.rangeLabel, range === value && styles.rangeLabelActive]}>{value}</Text>
              </PressableScale>
            ))}
          </View>
          <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
            {primaryLayout.svgPath ? (
              <Path d={primaryLayout.svgPath} stroke={colors.accent} fill="none" strokeWidth={2.5} />
            ) : null}
            {overlayLayout.svgPath ? (
              <Path d={overlayLayout.svgPath} stroke={colors.warning} fill="none" strokeWidth={2} />
            ) : null}
            {primaryLayout.markers.map((marker, index) => (
              <Circle key={`${marker.cx}:${marker.cy}:${index}`} cx={marker.cx} cy={marker.cy} r={3} fill={colors.textPrimary} />
            ))}
            {/* Y-axis labels */}
            {primaryLayout.maxVal !== primaryLayout.minVal ? (
              <>
                <SvgText
                  x={primaryLayout.padding.left - 4}
                  y={primaryLayout.padding.top + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill={colors.textSecondary}
                >
                  {primaryLayout.maxVal.toFixed(0)}
                </SvgText>
                <SvgText
                  x={primaryLayout.padding.left - 4}
                  y={primaryLayout.padding.top + primaryLayout.plotH}
                  textAnchor="end"
                  fontSize={10}
                  fill={colors.textSecondary}
                >
                  {primaryLayout.minVal.toFixed(0)}
                </SvgText>
              </>
            ) : null}
            {/* X-axis date labels */}
            {xLabelPoints.map((pt, i) => (
              <SvgText
                key={i}
                x={pt.x}
                y={CHART_HEIGHT - 4}
                textAnchor="middle"
                fontSize={9}
                fill={colors.textSecondary}
              >
                {formatShortDate(pt.date)}
              </SvgText>
            ))}
          </Svg>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.regionChipRow}>
              {Object.keys(regionTrends).map((slug) => (
                <PressableScale
                  key={slug}
                  style={[styles.rangeChip, activeRegion === slug && styles.rangeChipActive]}
                  onPress={() => setActiveRegion((current) => current === slug ? null : slug)}
                >
                  <Text style={[styles.rangeLabel, activeRegion === slug && styles.rangeLabelActive]}>
                    {slug.replace(/_/g, " ")}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : scans.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.body}>No premium scans yet.</Text>
        </View>
      ) : (
        <View style={styles.photoGrid}>
          {scans.map((item) => (
            <PressableScale
              key={item.id}
              style={styles.photoCard}
              onPress={() => navigation.navigate("PhysiqueScanDetail", { scanId: item.id })}
            >
              {item.photo_url
                ? <Image source={{ uri: item.photo_url }} style={styles.photoThumb} />
                : <View style={[styles.photoThumb, styles.photoPlaceholder]} />}
              <View style={styles.photoOverlay}>
                <Text style={styles.photoScore}>{item.physique_score.toFixed(1)}</Text>
              </View>
              <Text style={styles.photoDate}>{formatDate(item.submitted_at)}</Text>
            </PressableScale>
          ))}
        </View>
      )}
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
    gap: spacing.sm,
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
  body: {
    color: colors.textSecondary,
    ...typography.body,
  },
  toggleRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  toggleChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  toggleChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  toggleLabel: {
    color: colors.textSecondary,
    ...typography.body,
  },
  toggleLabelActive: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rangeRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  rangeChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  rangeChipActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.16)",
  },
  rangeLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  rangeLabelActive: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  regionChipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  photoCard: {
    width: "48.5%",
    gap: spacing.xs,
  },
  photoThumb: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  photoPlaceholder: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoOverlay: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: "rgba(15,23,42,0.88)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  photoScore: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
  },
  photoDate: {
    color: colors.textSecondary,
    ...typography.small,
  },
});
