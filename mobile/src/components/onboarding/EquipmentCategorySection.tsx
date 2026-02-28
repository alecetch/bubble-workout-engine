import React from "react";
import { LayoutAnimation, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { PillGrid } from "./PillGrid";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type EquipmentOption = {
  value: string;
  label: string;
};

type EquipmentCategorySectionProps = {
  category: string;
  options: EquipmentOption[];
  selectedValues: string[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onToggleItem: (value: string) => void;
};

export function EquipmentCategorySection({
  category,
  options,
  selectedValues,
  collapsed,
  onToggleCollapsed,
  onToggleItem,
}: EquipmentCategorySectionProps): React.JSX.Element {
  const selectedCount = options.filter((option) => selectedValues.includes(option.value)).length;

  return (
    <View style={styles.section}>
      <PressableScale
        style={styles.header}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggleCollapsed();
        }}
      >
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{category}</Text>
          <Text style={styles.headerMeta}>{`${selectedCount}/${options.length} selected`}</Text>
        </View>
        <Text style={styles.chevron}>{collapsed ? "▾" : "▴"}</Text>
      </PressableScale>

      {!collapsed ? (
        <View style={styles.body}>
          <PillGrid options={options} selectedValues={selectedValues} onToggle={onToggleItem} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  header: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  headerMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  chevron: {
    color: colors.textSecondary,
    ...typography.body,
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
});
