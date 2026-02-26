import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "../../theme/spacing";
import { Pill } from "./Pill";

type DayOption = {
  label: string;
  value: string;
};

type DayChipRowProps = {
  days: DayOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
};

export function DayChipRow({ days, selectedValues, onToggle }: DayChipRowProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      {days.map((day) => (
        <View style={styles.item} key={day.value}>
          <Pill
            label={day.label}
            selected={selectedValues.includes(day.value)}
            onPress={() => onToggle(day.value)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  item: {
    minWidth: 64,
    flexGrow: 1,
  },
});
