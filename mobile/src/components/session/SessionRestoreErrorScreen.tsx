import React, { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useIsOffline } from "../../lib/network";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { PressableScale } from "../interaction/PressableScale";

type Props = { onRetry: () => void; onSignOut: () => void; isRetrying: boolean };

export function SessionRestoreErrorScreen({ onRetry, onSignOut, isRetrying }: Props): React.JSX.Element {
  const offline = useIsOffline();
  const wasOffline = useRef(offline);
  useEffect(() => {
    const reconnected = wasOffline.current && !offline;
    wasOffline.current = offline;
    if (reconnected) onRetry();
  }, [offline, onRetry]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Can&apos;t reach Forma</Text>
      <Text style={styles.body}>Check your connection. You&apos;re still signed in.</Text>
      <PressableScale accessibilityLabel="Retry" disabled={isRetrying}
        style={[styles.primary, isRetrying && styles.disabled]} onPress={onRetry}>
        {isRetrying ? <ActivityIndicator color={colors.textPrimary} accessibilityLabel="Retrying session restoration" /> : <Text style={styles.primaryText}>Retry</Text>}
      </PressableScale>
      <PressableScale accessibilityLabel="Sign out" onPress={onSignOut} style={styles.secondary}>
        <Text style={styles.secondaryText}>Sign out</Text>
      </PressableScale>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: spacing.xl, gap: spacing.lg },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: "center" },
  body: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  primary: { backgroundColor: colors.accent, padding: spacing.md, borderRadius: radii.card, alignItems: "center" },
  primaryText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  disabled: { opacity: 0.6 },
  secondary: { padding: spacing.md, alignItems: "center" },
  secondaryText: { ...typography.body, color: colors.textSecondary },
});
