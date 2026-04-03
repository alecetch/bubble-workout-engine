import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { apiLogout } from "../../api/authApi";
import { clearTokens, getRefreshToken } from "../../api/tokenStorage";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export function SettingsScreen(): React.JSX.Element {
  const queryClient = useQueryClient();
  const clearSession = useSessionStore((state) => state.clearSession);

  const handleLogout = async (): Promise<void> => {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      void apiLogout(refreshToken).catch(() => {
        // ignore logout API errors; local logout should still complete
      });
    }
    await clearTokens();
    clearSession();
    void queryClient.clear();
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Account and app preferences will appear here.</Text>
      <PressableScale style={styles.logoutButton} onPress={() => void handleLogout()}>
        <Text style={styles.logoutLabel}>Log out</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  logoutButton: {
    minHeight: 48,
    minWidth: 160,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  logoutLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
});
