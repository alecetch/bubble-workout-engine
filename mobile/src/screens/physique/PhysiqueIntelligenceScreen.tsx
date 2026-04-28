import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Svg, { Circle, Rect } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { PressableScale } from "../../components/interaction/PressableScale";
import { captureAndShare, PhysiqueShareCard } from "../../components/physique/PhysiqueShareCard";
import { useEntitlement, usePhysiqueScans } from "../../api/hooks";
import { submitScan, type ScanResult } from "../../api/physiqueScan";
import { recordConsent } from "../../api/physique";
import { ApiError } from "../../api/client";
import type { HistoryStackParamList } from "../../navigation/HistoryStackNavigator";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<HistoryStackParamList, "PhysiqueIntelligence">;

type ScreenState =
  | { phase: "consent" }
  | { phase: "picker" }
  | { phase: "preview"; photoUri: string }
  | { phase: "uploading" }
  | { phase: "result"; photoUri: string; result: ScanResult }
  | { phase: "upgrade" }
  | { phase: "low_quality" }
  | { phase: "error"; message: string };

const MILESTONE_LABELS: Record<string, string> = {
  first_scan: "First scan complete!",
  three_week_streak: "3-week streak!",
  six_week_streak: "6-week streak!",
  twelve_week_streak: "12-week streak!",
  score_70: "Physique Score 70+ unlocked",
  score_80: "Physique Score 80+ unlocked",
  score_90: "Physique Score 90+ unlocked",
  biggest_weekly_gain: "Biggest weekly gain",
  ten_scans: "10 scans completed",
};

function formatRegionName(slug: string): string {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMilestone(slug: string): string {
  return MILESTONE_LABELS[slug] ?? formatRegionName(slug.replace(/^region_peak_/, "")) + " personal best";
}

function getDeltaTone(delta: number | null) {
  if (delta == null) return colors.textSecondary;
  return delta >= 0 ? colors.success : colors.warning;
}

export function PhysiqueIntelligenceScreen({ navigation }: Props): React.JSX.Element {
  const entitlementQuery = useEntitlement();
  const scansQuery = usePhysiqueScans(12);
  const [state, setState] = React.useState<ScreenState>({ phase: "picker" });
  const lastResultRef = React.useRef<ScanResult | null>(null);

  const isPremium = entitlementQuery.data?.subscription_status === "active";
  React.useEffect(() => {
    if (entitlementQuery.isSuccess && !isPremium) {
      setState({ phase: "upgrade" });
    }
  }, [entitlementQuery.isSuccess, isPremium]);

  React.useEffect(() => {
    if (
      scansQuery.error &&
      typeof scansQuery.error === "object" &&
      "code" in scansQuery.error &&
      scansQuery.error.code === "premium_required"
    ) {
      setState({ phase: "upgrade" });
    }
  }, [scansQuery.error]);

  const openPaywall = React.useCallback(() => {
    const parent = navigation.getParent() as any;
    parent?.navigate?.("HomeTab", { screen: "Paywall" });
  }, [navigation]);

  const pickPhoto = React.useCallback(async (mode: "camera" | "library") => {
    if (mode === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera access required", "Allow camera access in Settings to take a photo.");
        return;
      }
    }

    const result = mode === "camera"
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.8,
        });

    if (!result.canceled && result.assets[0]) {
      setState({ phase: "preview", photoUri: result.assets[0].uri });
    }
  }, []);

  const handleAnalyse = React.useCallback(async (photoUri: string) => {
    setState({ phase: "uploading" });
    try {
      const result = await submitScan(photoUri);
      lastResultRef.current = result;
      await scansQuery.refetch();
      setState({ phase: "result", photoUri, result });
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        setState({ phase: "upgrade" });
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setState({ phase: "consent" });
        return;
      }
      if (error instanceof ApiError && error.status === 422) {
        setState({ phase: "low_quality" });
        return;
      }
      setState({
        phase: "error",
        message: error instanceof Error ? error.message : "Unable to analyse your scan.",
      });
    }
  }, [scansQuery]);

  const handleShare = React.useCallback(async (result: ScanResult) => {
    try {
      await captureAndShare(result);
    } catch (error) {
      Alert.alert("Share unavailable", error instanceof Error ? error.message : "Unable to share this card yet.");
    }
  }, []);

  if (state.phase === "upgrade") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Physique Intelligence</Text>
        <Text style={styles.body}>This premium feature unlocks your Physique Score, trend charts, streaks, and milestone achievements.</Text>
        <PressableScale style={styles.primaryButton} onPress={openPaywall}>
          <Text style={styles.primaryLabel}>Upgrade to Premium</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.phase === "consent") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Physique Tracking Terms</Text>
        <Text style={styles.body}>
          Photos are stored securely and only visible to you. AI analysis is run by OpenAI — your photo is sent for analysis and the result is stored, but the photo is not retained by OpenAI after processing. You can delete any photo at any time.
        </Text>
        <PressableScale
          style={styles.primaryButton}
          onPress={async () => {
            try {
              await recordConsent();
              setState({ phase: "picker" });
            } catch {
              setState({ phase: "error", message: "Could not record consent. Please try again." });
            }
          }}
        >
          <Text style={styles.primaryLabel}>I understand — continue</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.phase === "low_quality") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Photo not usable</Text>
        <Text style={styles.body}>
          We couldn't detect your physique clearly. For the best results:
        </Text>
        <View style={styles.tipList}>
          <Text style={styles.tip}>• Good lighting — natural light or a bright room</Text>
          <Text style={styles.tip}>• Plain background — avoid busy patterns or clutter</Text>
          <Text style={styles.tip}>• Face the camera front-on or turn to show your back</Text>
          <Text style={styles.tip}>• Minimal clothing so muscle groups are visible</Text>
        </View>
        <PressableScale style={styles.primaryButton} onPress={() => setState({ phase: "picker" })}>
          <Text style={styles.primaryLabel}>Try a different photo</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.phase === "uploading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.title}>Analysing your physique...</Text>
        <Text style={styles.body}>This takes around 15 seconds</Text>
      </View>
    );
  }

  if (state.phase === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>{state.message}</Text>
        <PressableScale style={styles.primaryButton} onPress={() => setState({ phase: "picker" })}>
          <Text style={styles.primaryLabel}>Try again</Text>
        </PressableScale>
      </View>
    );
  }

  if (state.phase === "preview") {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Preview your scan</Text>
        <Image source={{ uri: state.photoUri }} style={styles.previewImage} resizeMode="cover" />
        <PressableScale style={styles.primaryButton} onPress={() => void handleAnalyse(state.photoUri)}>
          <Text style={styles.primaryLabel}>Analyse</Text>
        </PressableScale>
        <PressableScale style={styles.secondaryButton} onPress={() => setState({ phase: "picker" })}>
          <Text style={styles.secondaryLabel}>Choose a different photo</Text>
        </PressableScale>
      </ScrollView>
    );
  }

  if (state.phase === "result") {
    const { result, photoUri } = state;
    const priorScan = scansQuery.data?.scans?.find((scan) => scan.id !== result.scan_id) ?? null;
    const ringCircumference = 2 * Math.PI * 58;
    const strokeOffset = ringCircumference * (1 - result.physique_score / 100);
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <PhysiqueShareCard scanResult={result} />
        <View style={styles.scoreCard}>
          <View style={styles.ringWrap}>
            <Svg width={140} height={140}>
              <Circle cx={70} cy={70} r={58} stroke="rgba(148,163,184,0.15)" strokeWidth={12} fill="none" />
              <Circle
                cx={70}
                cy={70}
                r={58}
                stroke={colors.accent}
                strokeWidth={12}
                fill="none"
                strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                rotation="-90"
                origin="70, 70"
              />
            </Svg>
            <View style={styles.scoreCenter}>
              <Text style={styles.scoreValue}>{result.physique_score.toFixed(1)}</Text>
              <Text style={styles.scoreLabel}>Physique Score</Text>
            </View>
          </View>
          <Text style={[styles.scoreDelta, { color: getDeltaTone(result.score_delta) }]}>
            {result.score_delta == null ? "First scan" : `${result.score_delta > 0 ? "+" : ""}${result.score_delta.toFixed(1)} ${result.score_delta >= 0 ? "↑" : "↓"}`}
          </Text>
          <View style={styles.streakChip}>
            <Text style={styles.streakLabel}>🔥 {result.streak} week streak</Text>
          </View>
        </View>

        {result.milestones_achieved.map((slug) => (
          <View key={slug} style={styles.milestoneCard}>
            <Text style={styles.milestoneTitle}>{formatMilestone(slug)}</Text>
            <Text style={styles.milestoneBody}>You unlocked a new physique milestone on this scan.</Text>
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Region breakdown</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.regionRow}>
              {Object.entries(result.region_scores).map(([slug, entry]) => (
                <View key={slug} style={styles.regionCard}>
                  <Text style={styles.regionName}>{formatRegionName(slug)}</Text>
                  {entry.confidence === "not_visible" ? (
                    <Text style={styles.regionMuted}>Not visible in photo</Text>
                  ) : (
                    <>
                      <View style={styles.regionTrack}>
                        <View style={[styles.regionFill, { width: `${((entry.score ?? 0) / 10) * 100}%` }]} />
                      </View>
                      <Text style={styles.regionScore}>{(entry.score ?? 0).toFixed(1)} / 10</Text>
                      <Text style={styles.regionDescriptor}>{entry.descriptor}</Text>
                    </>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {result.ai_coaching_narrative ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>AI coaching narrative</Text>
            <Text style={styles.bodyStrong}>{result.ai_coaching_narrative}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Observations</Text>
          {result.observations.map((item) => (
            <Text key={item} style={styles.bulletText}>• {item}</Text>
          ))}
        </View>

        {result.comparison ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Comparison</Text>
            <View style={styles.comparisonStrip}>
              <View style={styles.comparisonThumbWrap}>
                {priorScan?.photo_url ? <Image source={{ uri: priorScan.photo_url }} style={styles.comparisonThumb} /> : <View style={[styles.comparisonThumb, styles.comparisonPlaceholder]} />}
                <Text style={styles.comparisonLabel}>Previous</Text>
              </View>
              <View style={styles.comparisonThumbWrap}>
                <Image source={{ uri: photoUri }} style={styles.comparisonThumb} />
                <Text style={styles.comparisonLabel}>Now</Text>
              </View>
            </View>
            <Text style={[styles.scoreDelta, { color: getDeltaTone(result.comparison.score_delta) }]}>
              {result.comparison.score_delta > 0 ? "+" : ""}{result.comparison.score_delta.toFixed(1)} • {result.comparison.trend}
            </Text>
            {result.comparison.narrative ? <Text style={styles.body}>{result.comparison.narrative}</Text> : null}
            <PressableScale style={styles.secondaryButton} onPress={() => navigation.navigate("PhysiqueScanDetail", { scanId: result.scan_id })}>
              <Text style={styles.secondaryLabel}>See full comparison</Text>
            </PressableScale>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Body composition breakdown</Text>
          {[
            ["Leanness", result.body_composition.leanness_rating],
            ["Fullness", result.body_composition.muscle_fullness_rating],
            ["Symmetry", result.body_composition.symmetry_rating],
          ].map(([label, value]) => (
            <View key={label} style={styles.metricRow}>
              <Text style={styles.metricLabel}>{label}</Text>
              <View style={styles.metricTrack}>
                <View style={[styles.metricFill, { width: `${(Number(value) / 10) * 100}%` }]} />
              </View>
              <Text style={styles.metricValue}>{Number(value).toFixed(1)}</Text>
            </View>
          ))}
          <View style={styles.stageChip}>
            <Text style={styles.stageLabel}>{formatRegionName(result.body_composition.development_stage)}</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>{result.disclaimer ?? "This is AI-generated guidance based on visual observation. It is not medical advice."}</Text>

        <View style={styles.actionsRow}>
          <PressableScale style={styles.secondaryAction} onPress={() => setState({ phase: "picker" })}>
            <Text style={styles.secondaryLabel}>Submit another</Text>
          </PressableScale>
          <PressableScale style={styles.secondaryAction} onPress={() => navigation.navigate("PhysiqueHistory")}>
            <Text style={styles.secondaryLabel}>View history</Text>
          </PressableScale>
        </View>
        <PressableScale style={styles.secondaryButton} onPress={() => navigation.navigate("PhysiqueMilestones")}>
          <Text style={styles.secondaryLabel}>View milestones</Text>
        </PressableScale>
        <PressableScale style={styles.primaryButton} onPress={() => void handleShare(result)}>
          <Text style={styles.primaryLabel}>Share progress</Text>
        </PressableScale>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Physique Intelligence</Text>
      <Text style={styles.body}>Upload a front or back progress photo in good lighting for your Physique Score and premium breakdown.</Text>
      <PressableScale style={styles.primaryButton} onPress={() => void pickPhoto("camera")}>
        <Text style={styles.primaryLabel}>Take photo</Text>
      </PressableScale>
      <PressableScale style={styles.secondaryButton} onPress={() => void pickPhoto("library")}>
        <Text style={styles.secondaryLabel}>Choose from library</Text>
      </PressableScale>
      {scansQuery.data?.scans?.length ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent scans</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.recentRow}>
              {scansQuery.data.scans.slice(0, 6).map((scan) => (
                <PressableScale key={scan.id} style={styles.recentItem} onPress={() => navigation.navigate("PhysiqueScanDetail", { scanId: scan.id })}>
                  {scan.photo_url ? <Image source={{ uri: scan.photo_url }} style={styles.recentImage} /> : <View style={[styles.recentImage, styles.comparisonPlaceholder]} />}
                  <Text style={styles.recentDate}>
                    {new Date(scan.submitted_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </Text>
                  <Text style={styles.recentScore}>{scan.physique_score.toFixed(1)}</Text>
                </PressableScale>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}
      <View style={styles.actionsRow}>
        <PressableScale style={styles.secondaryAction} onPress={() => navigation.navigate("PhysiqueMilestones")}>
          <Text style={styles.secondaryLabel}>Milestones</Text>
        </PressableScale>
        <PressableScale style={styles.secondaryAction} onPress={() => navigation.navigate("PhysiqueHistory")}>
          <Text style={styles.secondaryLabel}>History</Text>
        </PressableScale>
        {lastResultRef.current ? (
          <PressableScale style={styles.secondaryAction} onPress={() => void handleShare(lastResultRef.current!)}>
            <Text style={styles.secondaryLabel}>Share last scan</Text>
          </PressableScale>
        ) : null}
      </View>
      {lastResultRef.current ? <PhysiqueShareCard scanResult={lastResultRef.current} /> : null}
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
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h1,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  bodyStrong: {
    color: colors.textPrimary,
    ...typography.body,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  secondaryLabel: {
    color: colors.textSecondary,
    ...typography.body,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  previewImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  scoreCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  ringWrap: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCenter: {
    position: "absolute",
    alignItems: "center",
  },
  scoreValue: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: "800",
  },
  scoreLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  scoreDelta: {
    ...typography.h3,
    fontWeight: "700",
    textAlign: "center",
  },
  streakChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(250,204,21,0.1)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.4)",
  },
  streakLabel: {
    color: colors.warning,
    ...typography.small,
    fontWeight: "700",
  },
  milestoneCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
    backgroundColor: "rgba(59,130,246,0.12)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  milestoneTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  milestoneBody: {
    color: colors.textSecondary,
    ...typography.small,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  regionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  regionCard: {
    width: 180,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  regionName: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  regionTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.18)",
    overflow: "hidden",
  },
  regionFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  regionScore: {
    color: colors.textPrimary,
    ...typography.small,
  },
  regionDescriptor: {
    color: colors.textSecondary,
    ...typography.small,
  },
  regionMuted: {
    color: colors.textSecondary,
    ...typography.small,
  },
  bulletText: {
    color: colors.textPrimary,
    ...typography.body,
  },
  comparisonStrip: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  comparisonThumbWrap: {
    flex: 1,
    gap: spacing.xs,
    alignItems: "center",
  },
  comparisonThumb: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radii.card,
    backgroundColor: colors.card,
  },
  comparisonPlaceholder: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  comparisonLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  metricLabel: {
    width: 78,
    color: colors.textSecondary,
    ...typography.small,
  },
  metricTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.18)",
    overflow: "hidden",
  },
  metricFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  metricValue: {
    minWidth: 32,
    color: colors.textPrimary,
    ...typography.small,
    textAlign: "right",
  },
  stageChip: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: "rgba(34,197,94,0.1)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
  },
  stageLabel: {
    color: colors.success,
    ...typography.small,
    fontWeight: "700",
  },
  tipList: {
    alignSelf: "stretch",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  tip: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
  },
  disclaimer: {
    color: colors.textSecondary,
    ...typography.label,
    textAlign: "center",
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  recentRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  recentItem: {
    alignItems: "center",
    gap: spacing.xs,
  },
  recentImage: {
    width: 72,
    height: 96,
    borderRadius: radii.card,
    backgroundColor: colors.card,
  },
  recentDate: {
    color: colors.textSecondary,
    ...typography.label,
    textAlign: "center",
  },
  recentScore: {
    color: colors.accent,
    ...typography.label,
    fontWeight: "700",
    textAlign: "center",
  },
});
