import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useExerciseGuidance } from "../../api/hooks";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type TechniqueSheetProps = {
  visible: boolean;
  exerciseId: string | null;
  exerciseName: string | null;
  onClose: () => void;
};

const SCREEN_HEIGHT = Dimensions.get("window").height;

export function TechniqueSheet({
  visible,
  exerciseId,
  exerciseName,
  onClose,
}: TechniqueSheetProps): React.JSX.Element {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const guidanceQuery = useExerciseGuidance(visible ? exerciseId : null);
  const guidance = guidanceQuery.data;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 120,
      }).start();
      return;
    }

    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [slideAnim, visible]);

  const hasAnyContent = Boolean(
    guidance &&
      (
        guidance.techniqueCue ||
        guidance.coachingCues.length > 0 ||
        guidance.techniqueSetup ||
        guidance.techniqueExecution.length > 0 ||
        guidance.techniqueMistakes.length > 0 ||
        guidance.loadGuidance ||
        guidance.loggingGuidance ||
        guidance.techniqueVideoUrl
      ),
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        <View style={styles.dragHandle} />

        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {exerciseName ?? "Technique"}
          </Text>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={12}>
            <Text style={styles.closeButtonText}>x</Text>
          </Pressable>
        </View>

        {guidanceQuery.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {guidance?.techniqueCue ? (
              <Text style={styles.headlineCue}>{guidance.techniqueCue}</Text>
            ) : null}

            {(guidance?.coachingCues.length ?? 0) > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cues</Text>
                {guidance?.coachingCues.map((cue, index) => (
                  <View key={`${cue}-${index}`} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>-</Text>
                    <Text style={styles.bulletText}>{cue}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {guidance?.techniqueVideoUrl ? (
              <View style={styles.videoContainer}>
                <Text style={styles.videoTitle}>Demo video available</Text>
                <Text style={styles.videoCaption}>
                  Open the technique clip in your device browser.
                </Text>
                <PressableScale
                  style={styles.videoLinkButton}
                  onPress={() => {
                    const videoUrl = guidance.techniqueVideoUrl;
                    if (!videoUrl) return;
                    void Linking.openURL(videoUrl);
                  }}
                >
                  <Text style={styles.videoLinkLabel}>Open video</Text>
                </PressableScale>
              </View>
            ) : null}

            {guidance?.techniqueSetup ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Setup</Text>
                <Text style={styles.bodyText}>{guidance.techniqueSetup}</Text>
              </View>
            ) : null}

            {(guidance?.techniqueExecution.length ?? 0) > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Execution</Text>
                {guidance?.techniqueExecution.map((step, index) => (
                  <View key={`${step}-${index}`} style={styles.bulletRow}>
                    <Text style={styles.bulletNumber}>{index + 1}.</Text>
                    <Text style={styles.bulletText}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {(guidance?.techniqueMistakes.length ?? 0) > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Common mistakes</Text>
                {guidance?.techniqueMistakes.map((mistake, index) => (
                  <View key={`${mistake}-${index}`} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>-</Text>
                    <Text style={[styles.bulletText, styles.mistakeText]}>{mistake}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {guidance?.loadGuidance ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Loading</Text>
                <Text style={styles.bodyText}>{guidance.loadGuidance}</Text>
              </View>
            ) : null}

            {guidance?.loggingGuidance ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>What to log</Text>
                <Text style={styles.bodyText}>{guidance.loggingGuidance}</Text>
              </View>
            ) : null}

            {guidanceQuery.isError ? (
              <Text style={styles.emptyText}>
                {guidanceQuery.error?.message ?? "Unable to load technique guidance."}
              </Text>
            ) : null}

            {!guidanceQuery.isLoading && !guidanceQuery.isError && !hasAnyContent ? (
              <Text style={styles.emptyText}>
                No technique notes for this exercise yet.
              </Text>
            ) : null}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: spacing.lg,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.h3,
    fontWeight: "700",
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 32,
  },
  headlineCue: {
    color: colors.accent,
    ...typography.h2,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.label,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.6,
  },
  bodyText: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  bulletDot: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
    width: 12,
  },
  bulletNumber: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
    width: 20,
    fontWeight: "600",
  },
  bulletText: {
    flex: 1,
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
  },
  mistakeText: {
    color: colors.warning,
  },
  videoContainer: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  videoTitle: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  videoCaption: {
    color: colors.textSecondary,
    ...typography.small,
  },
  videoLinkButton: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  videoLinkLabel: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
  emptyText: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
    paddingVertical: spacing.lg,
    opacity: 0.6,
  },
});
