import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<AuthStackParamList, "WelcomeLogin">;

export function WelcomeLoginScreen({ navigation }: Props): React.JSX.Element {
  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome</Text>
      </View>

      <View style={styles.actions}>
        <PressableScale style={styles.primaryButton} onPress={() => navigation.navigate("DevLogin")}>
          <Text style={styles.primaryLabel}>Continue</Text>
        </PressableScale>
        <PressableScale style={styles.secondaryButton} onPress={() => navigation.navigate("ResetPassword")}>
          <Text style={styles.secondaryLabel}>Reset password</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: colors.textPrimary,
    ...typography.h1,
  },
  actions: {
    gap: spacing.md,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  secondaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "500",
  },
});
