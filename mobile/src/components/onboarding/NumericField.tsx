import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type NumericFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  testID?: string;
};

export function NumericField({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  error,
  testID,
}: NumericFieldProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType="numeric"
        textContentType="none"
        autoComplete="off"
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
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    textAlignVertical: "center",
    ...typography.body,
    includeFontPadding: false,
    lineHeight: 20,
  },
  inputError: {
    borderColor: colors.warning,
  },
  error: {
    color: colors.warning,
    ...typography.small,
  },
});
