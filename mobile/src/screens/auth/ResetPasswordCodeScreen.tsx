import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, apiFetch } from "../../api/client";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<AuthStackParamList, "ResetPasswordCode">;

export function ResetPasswordCodeScreen({ navigation, route }: Props): React.JSX.Element {
  const { email } = route.params;

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const prevPasswordLenRef = useRef(0);
  const prevConfirmLenRef = useRef(0);

  const handleSubmit = async (): Promise<void> => {
    if (code.trim().length !== 6) {
      setErrorMessage("Enter the 6-digit code from your email.");
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

    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: { email, code: code.trim(), new_password: password },
      });
      setSuccess(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setErrorMessage("Invalid or expired code. Please request a new one.");
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <View style={styles.root}>
        <View style={styles.content}>
          <Text style={styles.title}>Password updated</Text>
          <Text style={styles.subtitle}>
            Your password has been reset. You can now sign in with your new password.
          </Text>
        </View>
        <View style={styles.actions}>
          <PressableScale
            style={styles.primaryButton}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.primaryLabel}>Sign in</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Enter reset code</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to {email}. Enter it below along with your new password.
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>6-digit code</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            returnKeyType="next"
            maxLength={6}
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder="000000"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, styles.codeInput]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>New password</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={(text) => {
                const diff = text.length - prevPasswordLenRef.current;
                prevPasswordLenRef.current = text.length;
                setPassword(text);
                if (diff > 1) {
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
              onSubmitEditing={() => confirmRef.current?.focus()}
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
          <Text style={styles.label}>Confirm new password</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={confirmRef}
              value={confirmPassword}
              onChangeText={(text) => {
                const diff = text.length - prevConfirmLenRef.current;
                prevConfirmLenRef.current = text.length;
                setConfirmPassword(text);
                if (diff > 1) {
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
          <Text style={styles.primaryLabel}>{isSubmitting ? "Resetting..." : "Reset password"}</Text>
        </PressableScale>
        <PressableScale
          style={styles.secondaryButton}
          disabled={isSubmitting}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.secondaryLabel}>Resend code</Text>
        </PressableScale>
        <PressableScale
          style={styles.linkButton}
          disabled={isSubmitting}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.linkLabel}>Back to sign in</Text>
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
  codeInput: {
    letterSpacing: 6,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
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
