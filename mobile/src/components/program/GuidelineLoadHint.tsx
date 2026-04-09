import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type GuidelineLoad = NonNullable<
  ProgramDayFullResponse["segments"][number]["exercises"][number]["guidelineLoad"]
>;

type GuidelineLoadHintProps = {
  guidelineLoad: GuidelineLoad;
};

function formatGuidelineValue(guidelineLoad: GuidelineLoad): string {
  if (guidelineLoad.unit === "bodyweight") return "Bodyweight";
  if (guidelineLoad.unit === "kg_per_hand") return `${guidelineLoad.value} kg / hand`;
  if (guidelineLoad.unit === "kg_per_side") return `${guidelineLoad.value} kg / side`;
  return `${guidelineLoad.value} kg`;
}

function confidenceLabel(confidence: GuidelineLoad["confidence"]): string {
  return `${confidence.charAt(0).toUpperCase()}${confidence.slice(1)} confidence`;
}

function confidenceDotStyle(confidence: GuidelineLoad["confidence"]) {
  if (confidence === "high") return styles.dotHigh;
  if (confidence === "medium") return styles.dotMedium;
  return styles.dotLow;
}

export function GuidelineLoadHint({ guidelineLoad }: GuidelineLoadHintProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <PressableScale style={styles.trigger} onPress={() => setExpanded((current) => !current)}>
        <View style={[styles.dot, confidenceDotStyle(guidelineLoad.confidence)]} />
        <Text style={styles.summaryText}>
          {`Suggested start: ${formatGuidelineValue(guidelineLoad)}  •  ${confidenceLabel(guidelineLoad.confidence)}`}
        </Text>
      </PressableScale>

      {expanded ? (
        <View style={styles.detailCard}>
          {guidelineLoad.set1Rule ? <Text style={styles.detailText}>{guidelineLoad.set1Rule}</Text> : null}
          {(guidelineLoad.reasoning ?? []).map((reason, index) => (
            <Text key={`${reason}-${index}`} style={styles.reasonText}>
              {reason}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 1,
  },
  dotHigh: {
    backgroundColor: colors.success,
  },
  dotMedium: {
    backgroundColor: colors.warning,
  },
  dotLow: {
    backgroundColor: colors.textSecondary,
  },
  summaryText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  detailCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  detailText: {
    color: colors.textPrimary,
    ...typography.small,
  },
  reasonText: {
    color: colors.textSecondary,
    ...typography.small,
  },
});
