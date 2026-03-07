import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "../../theme/spacing";
import { Pill } from "./Pill";

type PillOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type PillGridProps = {
  options: PillOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
};

function chunkIntoRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function PillGrid({ options, selectedValues, onToggle }: PillGridProps): React.JSX.Element {
  const rows = chunkIntoRows(options, 2);

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View style={styles.row} key={`pill-row-${rowIndex}`}>
          {row.map((option) => (
            <View style={styles.cell} key={option.value}>
              <Pill
                label={option.label}
                selected={selectedValues.includes(option.value)}
                onPress={() => onToggle(option.value)}
                disabled={option.disabled}
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
  grid: {
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
