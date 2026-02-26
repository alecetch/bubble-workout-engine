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

export function PresetCardList({ options, selectedValue, onSelect }: PresetCardListProps): React.JSX.Element {
  return (
    <View style={styles.list}>
      {options.map((option) => (
        <PresetCard
          key={option.value}
          title={option.title}
          description={option.description}
          selected={selectedValue === option.value}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
});
