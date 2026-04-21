import React, { useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { type AccountInfo, updateDisplayName } from "../../api/accountApi";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { SettingsStackParamList } from "../../navigation/SettingsStackNavigator";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<SettingsStackParamList, "AccountName">;

export function AccountNameScreen({ navigation, route }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(route.params.currentName ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (name: string) => updateDisplayName(name),
    onSuccess: (newName) => {
      queryClient.setQueryData<AccountInfo | undefined>(["accountInfo"], (old) =>
        old ? { ...old, displayName: newName } : old,
      );
      navigation.goBack();
    },
    onError: () => setError("Couldn't save. Try again."),
  });

  const handleSave = (): void => {
    const trimmed = value.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      setError("Name must be 1-60 characters.");
      return;
    }
    setError(null);
    mutation.mutate(trimmed);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <PressableScale style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </PressableScale>
        <Text style={styles.title}>Edit Name</Text>
        <TextInput
          autoFocus
          maxLength={60}
          returnKeyType="done"
          value={value}
          onChangeText={setValue}
          placeholder="Your name"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PressableScale
          style={[styles.primaryButton, mutation.isPending ? styles.disabledButton : null]}
          disabled={mutation.isPending}
          onPress={handleSave}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.primaryLabel}>Save</Text>
          )}
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
});
