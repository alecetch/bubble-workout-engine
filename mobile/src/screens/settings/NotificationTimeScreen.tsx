import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { updateNotificationPreferences } from "../../api/notifications";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { SettingsStackParamList } from "../../navigation/SettingsStackNavigator";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<SettingsStackParamList, "NotificationTime">;

function makeTimes(): string[] {
  const items: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      items.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return items;
}

function formatTimeLabel(time: string): string {
  const [hourRaw, minute] = time.split(":").map(Number);
  const suffix = hourRaw >= 12 ? "PM" : "AM";
  const hour12 = hourRaw % 12 === 0 ? 12 : hourRaw % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function NotificationTimeScreen({ navigation, route }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedTime, setSelectedTime] = useState(route.params.currentTime);
  const [error, setError] = useState<string | null>(null);
  const times = useMemo(() => makeTimes(), []);

  const mutation = useMutation({
    mutationFn: (time: string) =>
      updateNotificationPreferences({
        reminderTimeLocalHhmm: time,
        reminderTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notificationPreferences"] });
      navigation.goBack();
    },
    onError: () => setError("Couldn't save reminder time. Try again."),
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <PressableScale style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </PressableScale>
        <Text style={styles.title}>Reminder Time</Text>
        <FlatList
          data={times}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const selected = item === selectedTime;
            return (
              <PressableScale onPress={() => setSelectedTime(item)}>
                <View style={[styles.timeRow, selected ? styles.selectedTimeRow : null]}>
                  <Text style={styles.timeLabel}>{formatTimeLabel(item)}</Text>
                </View>
              </PressableScale>
            );
          }}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PressableScale
          style={[styles.primaryButton, mutation.isPending ? styles.disabledButton : null]}
          disabled={mutation.isPending}
          onPress={() => {
            setError(null);
            mutation.mutate(selectedTime);
          }}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.primaryLabel}>Save</Text>
          )}
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  timeRow: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  selectedTimeRow: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  timeLabel: {
    color: colors.textPrimary,
    ...typography.body,
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
});
