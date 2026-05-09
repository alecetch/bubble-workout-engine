import React from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { updatePreferredHeightUnit, updatePreferredUnit } from "../../api/profileApi";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { SettingsStackParamList } from "../../navigation/SettingsStackNavigator";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<SettingsStackParamList, "UnitPicker">;

const WEIGHT_OPTIONS: { value: "kg" | "lbs"; label: string }[] = [
  { value: "kg", label: "kg — Kilograms" },
  { value: "lbs", label: "lbs — Pounds" },
];

const HEIGHT_OPTIONS: { value: "cm" | "ft"; label: string }[] = [
  { value: "cm", label: "cm — Centimetres" },
  { value: "ft", label: "ft — Feet & inches" },
];

export function UnitPickerScreen({ navigation, route }: Props): React.JSX.Element {
  const queryClient = useQueryClient();

  const weightMutation = useMutation({
    mutationFn: (unit: "kg" | "lbs") => updatePreferredUnit(unit),
    onSuccess: (_result, unit) => {
      queryClient.setQueryData(["preferredUnit"], unit);
    },
  });

  const heightMutation = useMutation({
    mutationFn: (unit: "cm" | "ft") => updatePreferredHeightUnit(unit),
    onSuccess: (_result, unit) => {
      queryClient.setQueryData(["preferredHeightUnit"], unit);
    },
  });

  const currentUnit = route.params.currentUnit;
  const currentHeightUnit = route.params.currentHeightUnit;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <PressableScale style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </PressableScale>
        <Text style={styles.title}>Units</Text>

        <Text style={styles.sectionLabel}>WEIGHT</Text>
        <View style={styles.card}>
          {WEIGHT_OPTIONS.map((option, index) => {
            const selected = currentUnit === option.value;
            return (
              <PressableScale
                key={option.value}
                disabled={weightMutation.isPending}
                onPress={() => weightMutation.mutate(option.value)}
              >
                <View style={[styles.row, index < WEIGHT_OPTIONS.length - 1 ? styles.rowDivider : null]}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {weightMutation.isPending && selected ? (
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

        <Text style={styles.sectionLabel}>HEIGHT</Text>
        <View style={styles.card}>
          {HEIGHT_OPTIONS.map((option, index) => {
            const selected = currentHeightUnit === option.value;
            return (
              <PressableScale
                key={option.value}
                disabled={heightMutation.isPending}
                onPress={() => heightMutation.mutate(option.value)}
              >
                <View style={[styles.row, index < HEIGHT_OPTIONS.length - 1 ? styles.rowDivider : null]}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {heightMutation.isPending && selected ? (
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
          Changing units affects how new values are entered. Stored data is not converted.
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
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    color: colors.textSecondary,
    ...typography.label,
    textTransform: "uppercase",
    marginTop: spacing.sm,
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
    marginTop: spacing.xs,
  },
});
