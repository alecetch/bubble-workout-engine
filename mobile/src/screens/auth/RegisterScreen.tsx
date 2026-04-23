import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { apiRegister, type AuthTokens } from "../../api/authApi";
import { ApiError } from "../../api/client";
import { createClientProfile, getClientProfile } from "../../api/clientProfiles";
import { logInPurchases } from "../../lib/purchases";
import { saveTokens } from "../../api/tokenStorage";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

function isOnboardingComplete(profile: { onboardingCompletedAt?: string | null; onboardingStepCompleted?: number }): boolean {
  if (profile.onboardingCompletedAt) return true;
  return Number(profile.onboardingStepCompleted ?? 0) >= 3;
}

export function RegisterScreen({ navigation }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const resetFromProfile = useOnboardingStore((state) => state.resetFromProfile);
  const setIdentity = useOnboardingStore((state) => state.setIdentity);
  const setSession = useSessionStore((state) => state.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const prevPasswordLenRef = useRef(0);
  const prevConfirmLenRef = useRef(0);

  const resolveClientProfile = async (clientProfileId: string | null | undefined) => {
    if (clientProfileId) {
      try {
        return await getClientProfile(clientProfileId);
      } catch {
        // Fall through and recreate if the referenced profile is missing/inaccessible.
      }
    }
    return createClientProfile({});
  };

  const handleSubmit = async (): Promise<void> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Enter your email.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    if (password.length > 72) {
      setErrorMessage("Password is too long.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    let result: AuthTokens;
    try {
      result = await apiRegister(normalizedEmail, password);
    } catch (error) {
      console.error("[RegisterScreen] apiRegister failed:", error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error));
      if (error instanceof ApiError && error.status === 409) {
        setErrorMessage("An account with this email already exists.");
      } else if (error instanceof ApiError && error.status === 400) {
        setErrorMessage(error.message || "Please check your details.");
      } else if (error instanceof ApiError) {
        setErrorMessage(error.message || "Unable to create account. Please try again.");
      } else {
        setErrorMessage("Unable to create account. Please try again.");
      }
      setIsSubmitting(false);
      return;
    }

    try {
      await saveTokens(result.access_token, result.refresh_token);
    } catch (error) {
      console.error("[RegisterScreen] saveTokens failed:", error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error));
      // Account created — navigate to login so they can sign in.
      navigation.navigate("Login");
      setIsSubmitting(false);
      return;
    }

    try {
      const profile = await resolveClientProfile(result.client_profile_id);
      const resolvedClientProfileId = profile.id;
      const entryRoute = isOnboardingComplete(profile) ? "ProgramReview" : "OnboardingEntry";

      queryClient.setQueryData(["me"], {
        id: result.user_id,
        clientProfileId: resolvedClientProfileId,
      });
      queryClient.setQueryData(["clientProfile", resolvedClientProfileId], profile);

      resetFromProfile(profile);
      setIdentity({ userId: result.user_id, clientProfileId: resolvedClientProfileId });
      logInPurchases(result.user_id);
      setSession({
        userId: result.user_id,
        clientProfileId: resolvedClientProfileId,
        entryRoute,
        subscriptionStatus: result.subscription_status,
        trialExpiresAt: result.trial_expires_at ?? null,
      });
    } catch (error) {
      console.error("[RegisterScreen] post-registration profile fetch failed:", error);
      navigation.navigate("Login");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Create an account to save your progress.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={(text) => {
                const diff = text.length - prevPasswordLenRef.current;
                prevPasswordLenRef.current = text.length;
                setPassword(text);
                if (diff > 1) {
                  // Bulk change = autofill/paste — sync confirm field.
                  setConfirmPassword(text);
                  prevConfirmLenRef.current = text.length;
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              passwordRules="minlength: 8;"
              returnKeyType="next"
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              placeholder="Create password"
              placeholderTextColor={colors.textSecondary}
              style={styles.inputFlex}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Confirm password</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={confirmPasswordRef}
              value={confirmPassword}
              onChangeText={(text) => {
                const diff = text.length - prevConfirmLenRef.current;
                prevConfirmLenRef.current = text.length;
                setConfirmPassword(text);
                if (diff > 1) {
                  // Bulk change = autofill/paste — sync password field.
                  setPassword(text);
                  prevPasswordLenRef.current = text.length;
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPassword}
              autoComplete="off"
              textContentType="none"
              returnKeyType="go"
              onSubmitEditing={() => void handleSubmit()}
              placeholder="Re-enter password"
              placeholderTextColor={colors.textSecondary}
              style={styles.inputFlex}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.actions}>
        <PressableScale
          style={[styles.primaryButton, isSubmitting && styles.disabledButton]}
          disabled={isSubmitting}
          onPress={() => void handleSubmit()}
        >
          <Text style={styles.primaryLabel}>{isSubmitting ? "Creating..." : "Create account"}</Text>
        </PressableScale>
        <PressableScale
          style={styles.secondaryButton}
          disabled={isSubmitting}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.secondaryLabel}>Already have an account? Sign in</Text>
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  inputFlex: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
  },
  eyeBtn: {
    paddingLeft: spacing.sm,
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
