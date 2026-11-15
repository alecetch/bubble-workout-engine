import { BRAND_WORDMARK } from "../../config/brand";
import React, { useEffect, useState } from "react";
import type { PurchasesPackage } from "react-native-purchases";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { syncEntitlement } from "../../api/entitlement";
import { queryKeys } from "../../api/hooks";
import { PressableScale } from "../../components/interaction/PressableScale";
import { LegalLinksRow } from "../../components/legal/LegalLinksRow";
import {
  getPurchaseOfferings,
  isPurchaseCancelledError,
  isPurchasesAvailable,
  purchasePackage,
  selectMonthlyPackage,
  restorePurchases as restorePurchasesSdk,
} from "../../lib/purchases";
import { reportError } from "../../lib/crashReporting";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
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

type PaywallParamList = OnboardingStackParamList & ProgramsStackParamList;
type Props = NativeStackScreenProps<PaywallParamList, "Paywall">;

export function PaywallScreen({ navigation }: Props): React.JSX.Element {
  const setEntitlement = useSessionStore((state) => state.setEntitlement);
  const subscriptionStatus = useSessionStore((state) => state.subscriptionStatus);
  const trialExpiresAt = useSessionStore((state) => state.trialExpiresAt);
  const queryClient = useQueryClient();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [offering, setOffering] = useState<
    { status: "loading" | "unavailable" } | { status: "ready"; pkg: PurchasesPackage }
  >({ status: "loading" });
  const [offeringRetry, setOfferingRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setOffering({ status: "loading" });
    void (async () => {
      try {
        const pkg = isPurchasesAvailable() ? selectMonthlyPackage(await getPurchaseOfferings()) : null;
        if (!cancelled) setOffering(pkg ? { status: "ready", pkg } : { status: "unavailable" });
      } catch (error) {
        reportError(error instanceof Error ? error : new Error("Offerings unavailable"), { area: "purchases.offerings_failed" });
        if (!cancelled) setOffering({ status: "unavailable" });
      }
    })();
    return () => { cancelled = true; };
  }, [offeringRetry]);

  const expires = trialExpiresAt ? new Date(trialExpiresAt).getTime() : 0;
  const inTrial = subscriptionStatus === "trialing" && expires > Date.now();
  const trialDays = Math.max(1, Math.ceil((expires - Date.now()) / 86_400_000));
  const price = offering.status === "ready" ? offering.pkg.product.priceString : null;
  const store = Platform.OS === "android" ? "Google Play" : "App Store";
  const paymentAccount = Platform.OS === "android" ? "Google Play account" : "Apple ID";

  const handlePurchase = async (): Promise<void> => {
    if (offering.status !== "ready" || isPurchasing || isRestoring) return;
    setIsPurchasing(true);
    try {
      const customerInfo = await purchasePackage(offering.pkg);
      const sdkActive = Boolean(customerInfo.entitlements.active.pro);
      let serverEntitlement = null;
      try {
        serverEntitlement = await syncEntitlement();
      } catch (error) {
        reportError(error instanceof Error ? error : new Error("Purchase sync failed"), { area: "purchases.sync_failed" });
      }
      if (serverEntitlement?.is_active) {
        setEntitlement(serverEntitlement.subscription_status, serverEntitlement.trial_expires_at);
      } else if (sdkActive) {
        setEntitlement("active", null);
        if (serverEntitlement) reportError(new Error("Purchased entitlement not yet active on server"), { area: "purchases.sync_mismatch" });
      } else if (serverEntitlement) {
        setEntitlement(serverEntitlement.subscription_status, serverEntitlement.trial_expires_at);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.entitlement });
      Alert.alert("You're subscribed", "Welcome back — your training is unlocked.", [
        { text: "Continue", onPress: () => navigation.goBack() },
      ]);
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
      const serverEntitlement = await syncEntitlement();
      const isActive = serverEntitlement?.is_active ?? Boolean(customerInfo.entitlements.active.pro);
      if (serverEntitlement) {
        setEntitlement(serverEntitlement.subscription_status, serverEntitlement.trial_expires_at);
        await queryClient.invalidateQueries({ queryKey: queryKeys.entitlement });
      } else if (isActive) {
        setEntitlement("active", null);
        await queryClient.invalidateQueries({ queryKey: queryKeys.entitlement });
      }
      if (isActive) {
        Alert.alert("Purchase restored", "Your subscription is active again.", [
          { text: "Continue", onPress: () => navigation.goBack() },
        ]);
      } else {
        const account = Platform.OS === "android" ? "Google account" : "Apple ID";
        Alert.alert("No purchase found", `We couldn't find an active subscription for this ${account}.`);
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
        <Text style={styles.eyebrow} numberOfLines={1} adjustsFontSizeToFit>{BRAND_WORDMARK}</Text>
        <Text style={styles.title}>{inTrial ? `Keep training with ${BRAND_WORDMARK} Pro` : "Your trial has ended"}</Text>
        <Text style={styles.subtitle}>
          {inTrial ? `Your free trial ends in ${trialDays} day${trialDays === 1 ? "" : "s"}. Subscribe now and you won't lose a session.` : "Subscribe to continue your training. Cancel anytime."}
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
        style={[styles.primaryButton, (offering.status !== "ready" || isPurchasing || isRestoring) && styles.buttonDisabled]}
        onPress={() => void handlePurchase()}
        disabled={offering.status !== "ready" || isPurchasing || isRestoring}
      >
        <Text style={styles.primaryLabel}>
          {isPurchasing ? "Processing..." : offering.status === "loading" ? "Loading…" : price ? `Subscribe for ${price}/month` : "Subscribe"}
        </Text>
        {offering.status === "ready" ? <Text style={styles.primarySubLabel}>Billed monthly. Cancel anytime.</Text> : null}
      </PressableScale>

      {offering.status === "unavailable" ? <View>
        <Text style={styles.legalNote}>Subscriptions are unavailable right now</Text>
        <PressableScale onPress={() => setOfferingRetry(value => value + 1)}>
          <Text style={styles.restoreLabel}>Try again</Text>
        </PressableScale>
      </View> : null}

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
        {`${price ? `${price} per month. ` : ""}Payment is charged to your ${paymentAccount} at confirmation. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in ${store} settings.`}
      </Text>
      <LegalLinksRow />
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
