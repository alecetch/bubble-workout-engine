import React, { useLayoutEffect, useMemo } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEquipmentItems } from "../../api/hooks";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { SettingsStackParamList } from "../../navigation/SettingsStackNavigator";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { toTitleCase } from "../../utils/text";

type Props = NativeStackScreenProps<SettingsStackParamList, "EquipmentPresetDetail">;

type GroupedItem = {
  category: string;
  items: Array<{ code: string; label: string }>;
};

export function EquipmentPresetDetailScreen({ navigation, route }: Props): React.JSX.Element {
  const { presetCode, presetLabel, isCurrentPreset } = route.params;
  const equipmentItemsQuery = useEquipmentItems(presetCode);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: presetLabel,
    });
  }, [navigation, presetLabel]);

  const groupedItems = useMemo<GroupedItem[]>(() => {
    const byCategory = new Map<string, Array<{ code: string; label: string }>>();
    for (const item of equipmentItemsQuery.data?.items ?? []) {
      const category = item.category ? toTitleCase(item.category) : "Other";
      const items = byCategory.get(category) ?? [];
      items.push({
        code: item.code,
        label: toTitleCase(item.label || item.code),
      });
      byCategory.set(category, items);
    }

    return Array.from(byCategory.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [equipmentItemsQuery.data?.items]);

  function handleUsePreset(): void {
    navigation.navigate("EquipmentSettings", { presetCodeToApply: presetCode });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Equipment preset</Text>
          <Text style={styles.title}>{presetLabel}</Text>
          <Text style={styles.subtitle}>
            {isCurrentPreset
              ? "This is your selected setup. Review what it includes or choose it again to refresh the prefilled equipment list."
              : "Review the typical equipment included in this setup before applying it to your profile."}
          </Text>
        </View>

        {equipmentItemsQuery.isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.statusText}>Loading preset equipment...</Text>
          </View>
        ) : null}

        {equipmentItemsQuery.isError ? (
          <View style={styles.messageBox}>
            <Text style={styles.errorText}>Unable to load equipment for this preset.</Text>
            <PressableScale
              style={styles.secondaryButton}
              onPress={() => {
                void equipmentItemsQuery.refetch();
              }}
            >
              <Text style={styles.secondaryButtonLabel}>Retry</Text>
            </PressableScale>
          </View>
        ) : null}

        {equipmentItemsQuery.isSuccess && groupedItems.length === 0 ? (
          <View style={styles.messageBox}>
            <Text style={styles.statusText}>No equipment items are listed for this preset.</Text>
          </View>
        ) : null}

        {groupedItems.map((group) => (
          <View key={group.category} style={styles.group}>
            <Text style={styles.groupTitle}>{group.category}</Text>
            <View style={styles.itemGrid}>
              {group.items.map((item) => (
                <View key={item.code} style={styles.itemPill}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <PressableScale style={styles.primaryButton} onPress={handleUsePreset}>
          <Text style={styles.primaryButtonLabel}>
            {isCurrentPreset ? "Use current preset" : "Use this preset"}
          </Text>
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
  },
  content: {
    padding: spacing.md,
    paddingBottom: 112,
    gap: spacing.md,
  },
  header: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.accent,
    ...typography.label,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
  },
  loadingBox: {
    minHeight: 96,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  messageBox: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statusText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  itemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  itemPill: {
    minHeight: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  itemLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  primaryButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 42,
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
});
