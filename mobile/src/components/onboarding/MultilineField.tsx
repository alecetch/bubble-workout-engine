import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type MultilineFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  numberOfLines?: number;
};

export function MultilineField({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  error,
  numberOfLines = 4,
}: MultilineFieldProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        multiline
        numberOfLines={numberOfLines}
        textAlignVertical="top"
        style={[styles.input, !!error && styles.inputError]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textPrimary,
    ...typography.label,
  },
  input: {
    minHeight: 110,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  inputError: {
    borderColor: colors.warning,
  },
  error: {
    color: colors.warning,
    ...typography.small,
  },
});
