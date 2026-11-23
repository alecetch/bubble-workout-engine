import React, { useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getPreferredHeightUnit, getPreferredUnit, updatePreferredHeightUnit, updatePreferredUnit } from "../../api/profileApi";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { SettingsStackParamList } from "../../navigation/SettingsStackNavigator";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<SettingsStackParamList, "UnitPicker">;

const WEIGHT_OPTIONS: { value: "kg" | "lbs"; label: string }[] = [
  { value: "kg", label: "kg — Kilograms" },
  { value: "lbs", label: "lb — Pounds" },
];

const HEIGHT_OPTIONS: { value: "cm" | "ft"; label: string }[] = [
  { value: "cm", label: "cm — Centimetres" },
  { value: "ft", label: "ft — Feet & inches" },
];

export function UnitPickerScreen({ navigation, route }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<"weight" | "height" | null>(null);
  const weightQuery = useQuery({ queryKey: ["preferredUnit"], queryFn: getPreferredUnit, staleTime: Infinity });
  const heightQuery = useQuery({ queryKey: ["preferredHeightUnit"], queryFn: getPreferredHeightUnit, staleTime: Infinity });
  const currentUnit = weightQuery.data ?? route.params.currentUnit;
  const currentHeightUnit = heightQuery.data ?? route.params.currentHeightUnit;

  const weightMutation = useMutation({
    mutationFn: (unit: "kg" | "lbs") => updatePreferredUnit(unit),
    onMutate: async (unit) => {
      setSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["preferredUnit"] });
      const previous = queryClient.getQueryData(["preferredUnit"]) ?? currentUnit;
      queryClient.setQueryData(["preferredUnit"], unit);
      return { previous };
    },
    onError: (_error, _unit, context) => {
      queryClient.setQueryData(["preferredUnit"], context?.previous ?? currentUnit);
      setSaveError("weight");
    },
    onSuccess: (_result, unit) => {
      queryClient.setQueryData(["preferredUnit"], unit);
    },
  });

  const heightMutation = useMutation({
    mutationFn: (unit: "cm" | "ft") => updatePreferredHeightUnit(unit),
    onMutate: async (unit) => {
      setSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["preferredHeightUnit"] });
      const previous = queryClient.getQueryData(["preferredHeightUnit"]) ?? currentHeightUnit;
      queryClient.setQueryData(["preferredHeightUnit"], unit);
      return { previous };
    },
    onError: (_error, _unit, context) => {
      queryClient.setQueryData(["preferredHeightUnit"], context?.previous ?? currentHeightUnit);
      setSaveError("height");
    },
    onSuccess: (_result, unit) => {
      queryClient.setQueryData(["preferredHeightUnit"], unit);
    },
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <PressableScale
          accessibilityLabel="Go back"
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
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
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected, disabled: weightMutation.isPending }}
                disabled={weightMutation.isPending}
                onPress={() => {
                  setSaveError(null);
                  if (!selected) weightMutation.mutate(option.value);
                }}
              >
                <View style={[styles.row, index < WEIGHT_OPTIONS.length - 1 ? styles.rowDivider : null]}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {weightMutation.isPending && weightMutation.variables === option.value ? (
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

        {saveError === "weight" ? <Text accessibilityRole="alert" style={styles.error}>Couldn't change units. Check your connection and try again.</Text> : null}
        <Text style={styles.note}>Used for body weight and training weights.</Text>
        <Text style={styles.sectionLabel}>HEIGHT</Text>
        <View style={styles.card}>
          {HEIGHT_OPTIONS.map((option, index) => {
            const selected = currentHeightUnit === option.value;
            return (
              <PressableScale
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected, disabled: heightMutation.isPending }}
                disabled={heightMutation.isPending}
                onPress={() => {
                  setSaveError(null);
                  if (!selected) heightMutation.mutate(option.value);
                }}
              >
                <View style={[styles.row, index < HEIGHT_OPTIONS.length - 1 ? styles.rowDivider : null]}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {heightMutation.isPending && heightMutation.variables === option.value ? (
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

        {saveError === "height" ? <Text accessibilityRole="alert" style={styles.error}>Couldn't change units. Check your connection and try again.</Text> : null}
        <Text style={styles.note}>
          Weights and heights are shown and entered in the units you choose. Your saved history isn't changed.
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
  error: { color: colors.error, ...typography.small },
  note: {
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
});
