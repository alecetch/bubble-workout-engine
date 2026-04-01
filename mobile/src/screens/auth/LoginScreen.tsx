import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { apiLogin } from "../../api/authApi";
import { ApiError } from "../../api/client";
import { getClientProfile } from "../../api/clientProfiles";
import { saveTokens } from "../../api/tokenStorage";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

function isOnboardingComplete(profile: { onboardingCompletedAt?: string | null; onboardingStepCompleted?: number }): boolean {
  if (profile.onboardingCompletedAt) return true;
  return Number(profile.onboardingStepCompleted ?? 0) >= 3;
}

export function LoginScreen({ navigation }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const resetFromProfile = useOnboardingStore((state) => state.resetFromProfile);
  const setIdentity = useOnboardingStore((state) => state.setIdentity);
  const setSession = useSessionStore((state) => state.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Enter your email.");
      return;
    }
    if (!password) {
      setErrorMessage("Enter your password.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await apiLogin(normalizedEmail, password);
      await saveTokens(result.access_token, result.refresh_token);
      const profile = await getClientProfile(result.client_profile_id);
      const entryRoute = isOnboardingComplete(profile) ? "ProgramReview" : "OnboardingEntry";

      queryClient.setQueryData(["me"], {
        id: result.user_id,
        clientProfileId: result.client_profile_id,
      });
      queryClient.setQueryData(["clientProfile", result.client_profile_id], profile);

      resetFromProfile(profile);
      setIdentity({ userId: result.user_id, clientProfileId: result.client_profile_id });
      setSession({ userId: result.user_id, clientProfileId: result.client_profile_id, entryRoute });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setErrorMessage("Incorrect email or password.");
      } else {
        setErrorMessage("Unable to sign in. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Use your email and password to continue.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Enter password"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.actions}>
        <PressableScale
          style={[styles.primaryButton, isSubmitting && styles.disabledButton]}
          disabled={isSubmitting}
          onPress={() => void handleSubmit()}
        >
          <Text style={styles.primaryLabel}>{isSubmitting ? "Signing in..." : "Sign in"}</Text>
        </PressableScale>
        <PressableScale
          style={styles.secondaryButton}
          disabled={isSubmitting}
          onPress={() => navigation.navigate("Register")}
        >
          <Text style={styles.secondaryLabel}>Don't have an account? Create one</Text>
        </PressableScale>
        <PressableScale
          style={styles.linkButton}
          disabled={isSubmitting}
          onPress={() => navigation.navigate("ResetPassword")}
        >
          <Text style={styles.linkLabel}>Forgot password?</Text>
        </PressableScale>
        <PressableScale style={styles.linkButton} disabled={isSubmitting} onPress={() => navigation.goBack()}>
          <Text style={styles.linkLabel}>Back</Text>
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
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textPrimary,
    ...typography.label,
  },
  input: {
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
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
    textAlign: "center",
  },
  linkButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  linkLabel: {
    color: colors.textSecondary,
    ...typography.body,
  },
});
