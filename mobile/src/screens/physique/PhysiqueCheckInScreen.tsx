import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { PressableScale } from "../../components/interaction/PressableScale";
import { usePhysiqueCheckIns } from "../../api/hooks";
import { recordConsent, submitCheckIn, type PhysiqueAnalysis } from "../../api/physique";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type ScreenState =
  | { phase: "consent" }
  | { phase: "picker"; hasConsented: boolean }
  | { phase: "preview"; photoUri: string }
  | { phase: "uploading" }
  | { phase: "result"; analysis: PhysiqueAnalysis; photoUri: string }
  | { phase: "error"; message: string };

export function PhysiqueCheckInScreen(): React.JSX.Element {
  const { data: checkInsData, refetch } = usePhysiqueCheckIns(6);
  const [state, setState] = useState<ScreenState>({ phase: "consent" });

  const handleConsent = async (): Promise<void> => {
    try {
      await recordConsent();
      setState({ phase: "picker", hasConsented: true });
    } catch {
      Alert.alert("Error", "Could not record consent. Please try again.");
    }
  };

  const pickFromLibrary = async (): Promise<void> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setState({ phase: "preview", photoUri: result.assets[0].uri });
    }
  };

  const takePhoto = async (): Promise<void> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera access required", "Allow camera access in Settings to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setState({ phase: "preview", photoUri: result.assets[0].uri });
    }
  };

  const handleUpload = async (photoUri: string): Promise<void> => {
    setState({ phase: "uploading" });
    try {
      const response = await submitCheckIn(photoUri);
      await refetch();
      setState({ phase: "result", analysis: response.analysis, photoUri });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setState({ phase: "error", message: msg });
    }
  };

  if (state.phase === "consent") {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Physique Tracking</Text>
        <Text style={styles.body}>
          Track your physique progress with weekly photos. Our AI coach gives you
          personalised observations about your muscle development and suggests which
          areas to emphasise in your next program.
        </Text>
        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>Your privacy</Text>
          <Text style={styles.privacyText}>
            {"- Photos are stored securely and only visible to you\n"}
            {"- AI analysis is run by OpenAI. Your photo is sent for analysis and the result is stored, but the photo itself is not retained by OpenAI after processing\n"}
            {"- You can delete any photo and its analysis at any time\n"}
            {"- Photos are permanently deleted if you close your account"}
          </Text>
        </View>
        <PressableScale style={styles.primaryButton} onPress={() => void handleConsent()}>
          <Text style={styles.primaryLabel}>I understand - start tracking</Text>
        </PressableScale>
      </ScrollView>
    );
  }

  if (state.phase === "picker" || state.phase === "preview") {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Weekly Check-In</Text>
        {state.phase === "preview" ? (
          <>
            <Image
              source={{ uri: state.photoUri }}
              style={styles.photoPreview}
              resizeMode="cover"
            />
            <PressableScale
              style={styles.primaryButton}
              onPress={() => void handleUpload(state.photoUri)}
            >
              <Text style={styles.primaryLabel}>Analyse this photo</Text>
            </PressableScale>
            <PressableScale
              style={styles.secondaryButton}
              onPress={() => setState({ phase: "picker", hasConsented: true })}
            >
              <Text style={styles.secondaryLabel}>Choose a different photo</Text>
            </PressableScale>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Take or choose a photo in good lighting. A front or back pose works best.
            </Text>
            <PressableScale style={styles.primaryButton} onPress={() => void takePhoto()}>
              <Text style={styles.primaryLabel}>Take photo</Text>
            </PressableScale>
            <PressableScale style={styles.secondaryButton} onPress={() => void pickFromLibrary()}>
              <Text style={styles.secondaryLabel}>Choose from library</Text>
            </PressableScale>
          </>
        )}
        {checkInsData && checkInsData.check_ins.length > 0 ? (
          <View style={styles.timelineSection}>
            <Text style={styles.sectionLabel}>Previous check-ins</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeline}>
              {checkInsData.check_ins.map((ci) => (
                <Image
                  key={ci.id}
                  source={{ uri: ci.photo_url ?? "" }}
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  if (state.phase === "uploading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.body, { marginTop: spacing.md, textAlign: "center" }]}>
          Analysing your photo...
        </Text>
        <Text style={[styles.label, { textAlign: "center", marginTop: spacing.xs }]}>
          This takes around 10 seconds
        </Text>
      </View>
    );
  }

  if (state.phase === "result") {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your Assessment</Text>
        {state.analysis.observations.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Observations</Text>
            {state.analysis.observations.map((obs, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={styles.bullet} />
                <Text style={styles.bulletText}>{obs}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {state.analysis.comparison_notes ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Progress since last check-in</Text>
            <Text style={styles.body}>{state.analysis.comparison_notes}</Text>
          </View>
        ) : null}
        {state.analysis.emphasis_suggestions.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Suggested focus areas</Text>
            <View style={styles.pillRow}>
              {state.analysis.emphasis_suggestions.map((slug) => (
                <View key={slug} style={styles.pill}>
                  <Text style={styles.pillLabel}>{slug.replace(/_/g, " ")}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.emphasisNote}>
              These will be considered in your next program generation.
            </Text>
          </View>
        ) : null}
        <Text style={styles.disclaimer}>{state.analysis.disclaimer}</Text>
        <PressableScale
          style={styles.secondaryButton}
          onPress={() => setState({ phase: "picker", hasConsented: true })}
        >
          <Text style={styles.secondaryLabel}>Submit another</Text>
        </PressableScale>
      </ScrollView>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.body}>{state.message}</Text>
      <PressableScale
        style={styles.primaryButton}
        onPress={() => setState({ phase: "picker", hasConsented: true })}
      >
        <Text style={styles.primaryLabel}>Try again</Text>
      </PressableScale>
    </View>
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
    gap: spacing.sm,
  },
  title: { color: colors.textPrimary, ...typography.h1, fontWeight: "700" },
  body: { color: colors.textSecondary, ...typography.body },
  label: { color: colors.textSecondary, ...typography.label },
  errorTitle: { color: colors.textPrimary, ...typography.h2 },
  privacyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  privacyTitle: { color: colors.textPrimary, ...typography.body, fontWeight: "600" },
  privacyText: { color: colors.textSecondary, ...typography.small, lineHeight: 20 },
  primaryButton: {
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: { color: colors.textPrimary, ...typography.body, fontWeight: "700" },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  secondaryLabel: { color: colors.textSecondary, ...typography.body },
  photoPreview: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  timelineSection: { gap: spacing.sm },
  sectionLabel: {
    color: colors.textSecondary,
    ...typography.label,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  timeline: { flexGrow: 0 },
  thumbnailImage: {
    width: 72,
    height: 96,
    borderRadius: radii.card,
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.textPrimary, ...typography.body, fontWeight: "600" },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 8,
    flexShrink: 0,
  },
  bulletText: { flex: 1, color: colors.textPrimary, ...typography.body },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillLabel: { color: colors.textPrimary, ...typography.small, textTransform: "capitalize" },
  emphasisNote: { color: colors.textSecondary, ...typography.small, fontStyle: "italic" },
  disclaimer: {
    color: colors.textSecondary,
    ...typography.label,
    textAlign: "center",
    lineHeight: 18,
  },
});
