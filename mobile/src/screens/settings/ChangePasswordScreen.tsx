import React, { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { changePassword } from "../../api/accountApi";
import { ApiError } from "../../api/client";
import { clearTokens } from "../../api/tokenStorage";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { SettingsStackParamList } from "../../navigation/SettingsStackNavigator";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<SettingsStackParamList, "ChangePassword">;

export function ChangePasswordScreen({ navigation }: Props): React.JSX.Element {
  const clearSession = useSessionStore((state) => state.clearSession);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: async () => {
      setIsSuccess(true);
      setMessage("Password updated.");
      await clearTokens();
      clearSession();
      setTimeout(() => navigation.goBack(), 1500);
    },
    onError: (error) => {
      setIsSuccess(false);
      if (error instanceof ApiError) {
        const code =
          error.details && typeof error.details === "object" && "code" in error.details
            ? String((error.details as { code?: unknown }).code ?? "")
            : "";
        if (code === "invalid_credentials") {
          setMessage("Current password is incorrect.");
          return;
        }
        if (code === "validation_error") {
          setMessage(error.message);
          return;
        }
      }
      setMessage("Couldn't update password. Try again.");
    },
  });

  useEffect(() => {
    return () => {
      setMessage(null);
    };
  }, []);

  const handleSubmit = (): void => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setIsSuccess(false);
      setMessage("Complete all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setIsSuccess(false);
      setMessage("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setIsSuccess(false);
      setMessage("New passwords do not match.");
      return;
    }
    setMessage(null);
    mutation.mutate();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <PressableScale style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </PressableScale>
        <Text style={styles.title}>Change Password</Text>
        <TextInput
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Current password"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
        />
        <TextInput
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
        />
        <TextInput
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
        />
        <PressableScale
          style={[styles.primaryButton, mutation.isPending ? styles.disabledButton : null]}
          disabled={mutation.isPending}
          onPress={handleSubmit}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.primaryLabel}>Update Password</Text>
          )}
        </PressableScale>
        {message ? (
          <Text style={[styles.messageText, isSuccess ? styles.successText : styles.errorText]}>{message}</Text>
        ) : null}
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
  messageText: {
    ...typography.small,
  },
  errorText: {
    color: colors.error,
  },
  successText: {
    color: colors.success,
  },
});
