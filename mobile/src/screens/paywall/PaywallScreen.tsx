import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../../components/interaction/PressableScale";
import {
  getPurchaseOfferings,
  isPurchaseCancelledError,
  isPurchasesAvailable,
  purchasePackage,
  restorePurchases as restorePurchasesSdk,
} from "../../lib/purchases";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const BENEFITS = [
  "Personalised progressive overload - your program adapts after every session",
  "Hyrox-specific conditioning and strength programming",
  "Real-time rest timers, set-by-set logging, and PR tracking",
  "Full session history and strength trend visualisation",
];

export function PaywallScreen(): React.JSX.Element {
  const setEntitlement = useSessionStore((state) => state.setEntitlement);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handlePurchase = async (): Promise<void> => {
    setIsPurchasing(true);
    try {
      const offerings = await getPurchaseOfferings();
      if (!offerings) {
        Alert.alert("Unavailable", "Subscriptions aren't available in this client build yet.");
        return;
      }
      const current = offerings.current;
      if (!current) {
        Alert.alert("Unavailable", "No subscription offering found. Please try again later.");
        return;
      }
      const pkg = current.availablePackages[0];
      if (!pkg) {
        Alert.alert("Unavailable", "No package available. Please try again later.");
        return;
      }
      await purchasePackage(pkg);
      setEntitlement("active", null);
    } catch (err: unknown) {
      if (!isPurchaseCancelledError(err)) {
        Alert.alert("Purchase failed", "Something went wrong. Please try again.");
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async (): Promise<void> => {
    setIsRestoring(true);
    try {
      if (!isPurchasesAvailable()) {
        Alert.alert("Unavailable", "Restore isn't available in this client build yet.");
        return;
      }
      const customerInfo = await restorePurchasesSdk();
      const entitlement = customerInfo.entitlements.active.pro;
      if (entitlement) {
        setEntitlement("active", null);
      } else {
        Alert.alert("No purchase found", "We couldn't find an active subscription for this Apple ID.");
      }
    } catch {
      Alert.alert("Restore failed", "Unable to restore purchases. Please try again.");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Formai</Text>
        <Text style={styles.title}>Your trial has ended</Text>
        <Text style={styles.subtitle}>
          Subscribe to continue your training. Cancel anytime.
        </Text>
      </View>

      <View style={styles.benefitsList}>
        {BENEFITS.map((benefit, index) => (
          <View key={index} style={styles.benefitRow}>
            <View style={styles.benefitDot} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      <PressableScale
        style={[styles.primaryButton, (isPurchasing || isRestoring) && styles.buttonDisabled]}
        onPress={() => void handlePurchase()}
        disabled={isPurchasing || isRestoring}
      >
        <Text style={styles.primaryLabel}>
          {isPurchasing ? "Processing..." : "Subscribe"}
        </Text>
        <Text style={styles.primarySubLabel}>Billed monthly - Cancel anytime</Text>
      </PressableScale>

      <PressableScale
        style={[styles.restoreButton, (isPurchasing || isRestoring) && styles.buttonDisabled]}
        onPress={() => void handleRestore()}
        disabled={isPurchasing || isRestoring}
      >
        <Text style={styles.restoreLabel}>
          {isRestoring ? "Restoring..." : "Restore purchase"}
        </Text>
      </PressableScale>

      <Text style={styles.legalNote}>
        Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.
        Manage in App Store settings.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.accent,
    ...typography.label,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h1,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  benefitsList: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  benefitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 8,
    flexShrink: 0,
  },
  benefitText: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
  },
  primaryButton: {
    minHeight: 60,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  primarySubLabel: {
    color: "rgba(248,250,252,0.7)",
    ...typography.small,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  restoreButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  restoreLabel: {
    color: colors.textSecondary,
    ...typography.small,
    textDecorationLine: "underline",
  },
  legalNote: {
    color: colors.textSecondary,
    ...typography.label,
    textAlign: "center",
    lineHeight: 18,
  },
});
