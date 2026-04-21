import React from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { updatePreferredUnit } from "../../api/profileApi";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { SettingsStackParamList } from "../../navigation/SettingsStackNavigator";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<SettingsStackParamList, "UnitPicker">;

const OPTIONS = [
  { value: "kg" as const, label: "kg - Kilograms" },
  { value: "lbs" as const, label: "lbs - Pounds" },
];

export function UnitPickerScreen({ navigation, route }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (unit: "kg" | "lbs") => updatePreferredUnit(unit),
    onSuccess: (_result, unit) => {
      queryClient.setQueryData(["preferredUnit"], unit);
      navigation.goBack();
    },
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <PressableScale style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </PressableScale>
        <Text style={styles.title}>Units</Text>
        <View style={styles.card}>
          {OPTIONS.map((option, index) => {
            const selected = route.params.currentUnit === option.value;
            return (
              <PressableScale
                key={option.value}
                disabled={mutation.isPending}
                onPress={() => mutation.mutate(option.value)}
              >
                <View style={[styles.row, index < OPTIONS.length - 1 ? styles.rowDivider : null]}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {mutation.isPending && selected ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <Ionicons
                      name={selected ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={selected ? colors.accent : colors.textSecondary}
                    />
                  )}
                </View>
              </PressableScale>
            );
          })}
        </View>
        <Text style={styles.note}>
          Changing units affects new entries only. Historical loads remain unchanged.
        </Text>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    color: colors.textPrimary,
    ...typography.body,
  },
  note: {
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 20,
  },
});
