import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { ExerciseMediaThumb } from "./ExerciseMediaThumb";

type WarmupExercise = ProgramDayFullResponse["segments"][number]["exercises"][number];

type WarmupSegmentSectionProps = {
  items: WarmupExercise[];
};

function exerciseName(item: WarmupExercise): string {
  return String(item.name || item.exerciseId || item.warmupExerciseId || "Warm-up").trim();
}

function prescriptionLabel(item: WarmupExercise): string {
  const pieces = [];
  if (item.rounds != null && item.rounds > 1) {
    pieces.push(`${item.rounds} rounds`);
  }
  if (item.durationOrRepsLabel) {
    pieces.push(item.durationOrRepsLabel);
  } else if (item.reps) {
    pieces.push([item.reps, item.repsUnit].filter(Boolean).join(" "));
  }
  return pieces.join(" · ");
}

export function WarmupSegmentSection({ items }: WarmupSegmentSectionProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!visibleItems.length) return null;

  return (
    <View style={styles.shell} testID="warmup-segment-section">
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse warm-up" : "Expand warm-up"}
        testID="warmup-toggle"
      >
        <View>
          <Text style={styles.title}>Warm-up</Text>
          <Text style={styles.count}>{visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.textSecondary}
          testID="warmup-chevron"
        />
      </Pressable>

      {expanded ? (
        <View style={styles.list} testID="warmup-items">
          {visibleItems.map((item, index) => {
            const label = prescriptionLabel(item);
            return (
              <View style={styles.itemCard} key={item.id ?? item.warmupExerciseId ?? item.exerciseId ?? index}>
                <ExerciseMediaThumb
                  stillImageUrl={item.stillImageUrl || ""}
                  videoUrl={item.videoUrl ?? null}
                  posterImageUrl={item.posterImageUrl ?? null}
                  videoStatus={item.videoStatus ?? "none"}
                />
                <View style={styles.itemText}>
                  <Text style={styles.name}>{exerciseName(item)}</Text>
                  {label ? <Text style={styles.meta}>{label}</Text> : null}
                  {item.cueText ? <Text style={styles.cue}>{item.cueText}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: spacing.sm,
  },
  header: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  count: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: 2,
  },
  list: {
    gap: spacing.sm,
  },
  itemCard: {
    flexDirection: "row",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  itemText: {
    flex: 1,
    gap: 3,
  },
  name: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  meta: {
    ...typography.label,
    color: colors.textSecondary,
  },
  cue: {
    ...typography.small,
    color: colors.textPrimary,
  },
});
