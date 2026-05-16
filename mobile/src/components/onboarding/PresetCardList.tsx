import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "../../theme/spacing";
import { PresetCard } from "./PresetCard";

type PresetOption = {
  value: string;
  title: string;
  description?: string;
};

type PresetCardListProps = {
  options: PresetOption[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
};

function chunkIntoRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function PresetCardList({
  options,
  selectedValue,
  onSelect,
}: PresetCardListProps): React.JSX.Element {
  const rows = chunkIntoRows(options, 2);

  return (
    <View style={styles.list}>
      {rows.map((row, rowIndex) => (
        <View style={styles.row} key={`preset-row-${rowIndex}`}>
          {row.map((option) => (
            <View style={styles.cell} key={option.value}>
              <PresetCard
                title={option.title}
                description={option.description}
                selected={selectedValue === option.value}
                onPress={() => onSelect(option.value)}
              />
            </View>
          ))}
          {row.length < 2 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
  },
});
