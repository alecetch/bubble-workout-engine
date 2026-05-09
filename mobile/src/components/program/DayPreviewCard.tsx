import React from "react";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Alert, Modal, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { rescheduleProgramDay, skipProgramDay } from "../../api/programDayActions";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type DayPreview = {
  programDayId?: string;
  label?: string;
  type?: string;
  sessionDuration?: number;
  equipmentSlugs?: string[];
  isCompleted?: boolean;
};

type DayPreviewCardProps = {
  preview?: DayPreview;
  programId?: string;
  onStartWorkout: () => void;
  onSessionSkipped?: () => void;
  onSessionRescheduled?: () => void;
};

function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return formatDateInput(date);
}

function tomorrowDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return tomorrowDate();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function DayPreviewCard({
  preview,
  programId,
  onStartWorkout,
  onSessionSkipped,
  onSessionRescheduled,
}: DayPreviewCardProps): React.JSX.Element {
  const hasProgramDay = Boolean(preview?.programDayId);
  const canManageSession = Boolean(programId && preview?.programDayId);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [dateModalOpen, setDateModalOpen] = React.useState(false);
  const [targetDate, setTargetDate] = React.useState(tomorrowIso());
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSkip = (): void => {
    if (!programId || !preview?.programDayId) return;
    const dayId = preview.programDayId;
    const alreadyComplete = Boolean(preview.isCompleted);
    Alert.alert(
      alreadyComplete ? "Session already completed" : "Mark this session as skipped?",
      alreadyComplete
        ? "This session has exercises logged and is marked complete. Are you sure you want to skip it? This will remove it from your required sessions."
        : "It won't count toward your required sessions.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip session",
          style: "destructive",
          onPress: () => {
            setIsSubmitting(true);
            setError(null);
            skipProgramDay(programId, dayId)
              .then(() => {
                setSheetOpen(false);
                onSessionSkipped?.();
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : "Could not skip this session.");
              })
              .finally(() => setIsSubmitting(false));
          },
        },
      ],
    );
  };

  const handleReschedule = async (nextTargetDate = targetDate): Promise<void> => {
    if (!programId || !preview?.programDayId || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setError(null);
      await rescheduleProgramDay(programId, preview.programDayId, nextTargetDate);
      setDateModalOpen(false);
      setSheetOpen(false);
      onSessionRescheduled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reschedule this session.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, date?: Date): void => {
    if (event.type === "dismissed" || !date) {
      setDateModalOpen(false);
      return;
    }
    const nextTargetDate = formatDateInput(date);
    setTargetDate(nextTargetDate);
    setDateModalOpen(false);
    void handleReschedule(nextTargetDate);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Day Preview</Text>
      <Text style={styles.rowLabel}>Label</Text>
      <Text style={styles.rowValue}>{preview?.label || "Select a scheduled workout day."}</Text>
      <Text style={styles.rowLabel}>Type</Text>
      <Text style={styles.rowValue}>{preview?.type || "Not set"}</Text>
      <Text style={styles.rowLabel}>Duration</Text>
      <Text style={styles.rowValue}>
        {typeof preview?.sessionDuration === "number" ? `${preview.sessionDuration} min` : "Not set"}
      </Text>

      <Text style={styles.rowLabel}>Equipment</Text>
      <View style={styles.chipsWrap}>
        {preview?.equipmentSlugs && preview.equipmentSlugs.length > 0 ? (
          preview.equipmentSlugs.map((slug) => (
            <View key={slug} style={styles.chip}>
              <Text style={styles.chipLabel}>{slug}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.rowValue}>Not set</Text>
        )}
      </View>

      <PressableScale style={[styles.startButton, !hasProgramDay && styles.startButtonDisabled]} onPress={onStartWorkout} disabled={!hasProgramDay}>
        <Text style={styles.startButtonLabel}>Start workout</Text>
      </PressableScale>
      {canManageSession ? (
        <PressableScale style={styles.optionsButton} onPress={() => setSheetOpen(true)}>
          <Text style={styles.optionsButtonLabel}>Session options</Text>
        </PressableScale>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {sheetOpen ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Session options</Text>
              <PressableScale style={styles.sheetOption} disabled={isSubmitting} onPress={handleSkip}>
                <Text style={styles.sheetOptionTitle}>Skip this session</Text>
                <Text style={styles.sheetOptionCopy}>Remove from your required sessions.</Text>
              </PressableScale>
              <PressableScale
                style={styles.sheetOption}
                disabled={isSubmitting}
                onPress={() => {
                  setTargetDate(tomorrowIso());
                  setSheetOpen(false);
                  setDateModalOpen(true);
                }}
              >
                <Text style={styles.sheetOptionTitle}>Reschedule</Text>
                <Text style={styles.sheetOptionCopy}>Move to a different future date.</Text>
              </PressableScale>
              <PressableScale style={styles.cancelButton} onPress={() => setSheetOpen(false)} disabled={isSubmitting}>
                <Text style={styles.cancelButtonLabel}>Cancel</Text>
              </PressableScale>
            </View>
          </View>
        </Modal>
      ) : null}

      {dateModalOpen ? (
        <DateTimePicker
          value={dateFromInput(targetDate)}
          mode="date"
          minimumDate={tomorrowDate()}
          onChange={handleDateChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  rowLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  rowValue: {
    color: colors.textPrimary,
    ...typography.body,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipLabel: {
    color: colors.textPrimary,
    ...typography.small,
  },
  startButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  optionsButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  optionsButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  errorText: {
    color: colors.warning,
    ...typography.small,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  sheetOption: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sheetOptionTitle: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  sheetOptionCopy: {
    color: colors.textSecondary,
    ...typography.small,
  },
  cancelButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonLabel: {
    color: colors.textSecondary,
    ...typography.body,
    fontWeight: "600",
  },
});
