import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AdaptationDecision } from "../../api/programViewer";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { PressableScale } from "../interaction/PressableScale";

const HIDDEN_OUTCOMES = new Set(["hold"]);

type ChipSemantic = "success" | "warning" | "info";

const OUTCOME_SEMANTIC: Record<string, ChipSemantic> = {
  increase_load: "success",
  increase_reps: "success",
  increase_sets: "success",
  reduce_rest: "info",
  deload_local: "warning",
};

const SEMANTIC_COLORS: Record<ChipSemantic, { bg: string; text: string; border: string }> = {
  success: { bg: "#052e16", text: colors.success, border: "#16a34a" },
  warning: { bg: "#451a03", text: colors.warning, border: "#d97706" },
  info: { bg: "#0c1a4a", text: colors.accent, border: "#3b82f6" },
};

type Props = {
  decision: AdaptationDecision;
  expanded: boolean;
  onToggle: () => void;
  onViewHistory?: () => void;
};

export function AdaptationChip({ decision, expanded, onToggle, onViewHistory }: Props): React.JSX.Element | null {
  if (HIDDEN_OUTCOMES.has(decision.outcome)) return null;

  const semantic = OUTCOME_SEMANTIC[decision.outcome] ?? "info";
  const palette = SEMANTIC_COLORS[semantic];

  return (
    <View style={styles.wrapper}>
      <PressableScale
        onPress={onToggle}
        style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}
        accessibilityLabel={`Adaptation: ${decision.displayChip}. Tap to expand.`}
      >
        <Text style={[styles.chipText, { color: palette.text }]}>{decision.displayChip}</Text>
      </PressableScale>

      {expanded ? (
        <Pressable onPress={() => {}}>
          <View style={styles.detail}>
            {decision.displayDetail ? <Text style={styles.detailText}>{decision.displayDetail}</Text> : null}
            {decision.confidence ? (
              <Text style={styles.confidenceText}>
                Confidence: {decision.confidence.charAt(0).toUpperCase() + decision.confidence.slice(1)}
              </Text>
            ) : null}
            {onViewHistory ? (
              <PressableScale onPress={onViewHistory} style={styles.historyLink}>
                <Text style={styles.historyLinkText}>View full history →</Text>
              </PressableScale>
            ) : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: spacing.xs,
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  chipText: {
    color: colors.textPrimary,
    ...typography.label,
    fontWeight: "600",
  },
  detail: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  detailText: {
    color: colors.textPrimary,
    ...typography.small,
    lineHeight: 18,
  },
  confidenceText: {
    color: colors.textSecondary,
    ...typography.label,
  },
  historyLink: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  historyLinkText: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
});
