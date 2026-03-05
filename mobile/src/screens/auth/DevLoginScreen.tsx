import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { createClientProfile, getClientProfile } from "../../api/clientProfiles";
import { getMe, linkClientProfileToMe } from "../../api/me";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<AuthStackParamList, "DevLogin">;

function isOnboardingComplete(profile: { onboardingCompletedAt?: string | null; onboardingStepCompleted?: number }): boolean {
  if (profile.onboardingCompletedAt) return true;
  return Number(profile.onboardingStepCompleted ?? 0) >= 3;
}

export function DevLoginScreen({ navigation }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const resetFromProfile = useOnboardingStore((state) => state.resetFromProfile);
  const setIdentity = useOnboardingStore((state) => state.setIdentity);
  const setSession = useSessionStore((state) => state.setSession);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async (): Promise<void> => {
    if (isSubmitting) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let me = await getMe();
      let clientProfileId = me.clientProfileId;

      if (!clientProfileId) {
        const created = await createClientProfile({});
        clientProfileId = created.id;
        me = await linkClientProfileToMe({ clientProfileId });
      }

      const profile = await getClientProfile(clientProfileId);
      const entryRoute = isOnboardingComplete(profile) ? "ProgramReview" : "OnboardingEntry";

      queryClient.setQueryData(["me"], me);
      queryClient.setQueryData(["clientProfile", clientProfileId], profile);

      resetFromProfile(profile);
      setIdentity({
        userId: me.id,
        clientProfileId,
      });
      setSession({
        userId: me.id,
        clientProfileId,
        entryRoute,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to continue in dev mode.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Dev login</Text>
        <Text style={styles.subtitle}>Dev mode - no password required.</Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.actions}>
        <PressableScale style={[styles.primaryButton, isSubmitting && styles.disabledButton]} onPress={() => void handleContinue()}>
          <Text style={styles.primaryLabel}>{isSubmitting ? "Continuing..." : "Continue as dev user"}</Text>
        </PressableScale>
        <PressableScale style={styles.secondaryButton} onPress={() => navigation.goBack()} disabled={isSubmitting}>
          <Text style={styles.secondaryLabel}>Back</Text>
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
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  errorText: {
    color: colors.warning,
    ...typography.small,
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
  disabledButton: {
    opacity: 0.7,
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
