import React, { useMemo, useState } from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { deleteAccount, getAccountInfo } from "../../api/accountApi";
import { apiLogout } from "../../api/authApi";
import {
  useClientProfile,
  useEntitlement,
  useMe,
  useReferralInfo,
  useReferralStats,
  useReferenceData,
} from "../../api/hooks";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "../../api/notifications";
import { getPreferredHeightUnit, getPreferredUnit } from "../../api/profileApi";
import { clearTokens, getRefreshToken } from "../../api/tokenStorage";
import { PressableScale } from "../../components/interaction/PressableScale";
import { logOutPurchases } from "../../lib/purchases";
import type { RootTabParamList } from "../../navigation/AppTabs";
import type { SettingsStackParamList } from "../../navigation/SettingsStackNavigator";
import { useSessionStore } from "../../state/session/sessionStore";
import { radii } from "../../theme/components";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<SettingsStackParamList, "Settings">;

const NOTIFICATION_ROWS = [
  {
    key: "prNotificationEnabled" as const,
    label: "PR Notifications",
    description: "Get notified when you set a new personal record.",
  },
  {
    key: "deloadNotificationEnabled" as const,
    label: "Recovery Notifications",
    description: "Get notified when your program adjusts for recovery.",
  },
  {
    key: "reminderEnabled" as const,
    label: "Workout Reminder",
    description: "Daily reminder when a training session is scheduled.",
  },
];

function formatReminderTimeLabel(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${suffix}`;
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function SkeletonRows({ count }: { count: number }): React.JSX.Element {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={`settings-skeleton-${count}-${index}`}
          testID="settings-skeleton-row"
          style={[styles.row, styles.skeletonRow, index < count - 1 ? styles.rowDivider : null]}
        />
      ))}
    </>
  );
}

function RetryRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <PressableScale accessibilityLabel={label} style={styles.retryRow} onPress={onPress}>
      <Text style={styles.retryText}>{label}</Text>
    </PressableScale>
  );
}

function SettingsRow({
  label,
  description,
  value,
  onPress,
  destructive = false,
  showChevron = false,
  showDivider = false,
  children,
}: {
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
  showDivider?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  const content = (
    <View style={[styles.row, showDivider ? styles.rowDivider : null]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, destructive ? styles.destructiveLabel : null]}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {children}
      {showChevron ? <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} /> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <PressableScale accessibilityLabel={label} onPress={onPress}>
      {content}
    </PressableScale>
  );
}

export function SettingsScreen({ navigation }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const clearSession = useSessionStore((state) => state.clearSession);
  const tabNavigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const entitlementQuery = useEntitlement();
  const meQuery = useMe();
  const referenceDataQuery = useReferenceData();
  const profileQuery = useClientProfile(meQuery.data?.clientProfileId ?? null);
  const ent = entitlementQuery.data;
  const referralQuery = useReferralInfo();
  const referralStatsQuery = useReferralStats();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [notifSaveError, setNotifSaveError] = useState<string | null>(null);
  const [dangerError, setDangerError] = useState<string | null>(null);

  const notifQuery = useQuery({
    queryKey: ["notificationPreferences"],
    queryFn: getNotificationPreferences,
  });
  const accountQuery = useQuery({
    queryKey: ["accountInfo"],
    queryFn: getAccountInfo,
  });
  const preferredUnitQuery = useQuery({
    queryKey: ["preferredUnit"],
    queryFn: getPreferredUnit,
  });
  const preferredHeightUnitQuery = useQuery({
    queryKey: ["preferredHeightUnit"],
    queryFn: getPreferredHeightUnit,
  });

  const notifMutation = useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) => updateNotificationPreferences(patch),
    onMutate: async (patch) => {
      setNotifSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["notificationPreferences"] });
      const prev = queryClient.getQueryData<NotificationPreferences>(["notificationPreferences"]);
      queryClient.setQueryData<NotificationPreferences | undefined>(
        ["notificationPreferences"],
        (old) => (old ? { ...old, ...patch } : old),
      );
      return { prev };
    },
    onError: (_err, _patch, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["notificationPreferences"], context.prev);
      }
      setNotifSaveError("Couldn't save. Check your connection.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notificationPreferences"] });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await clearTokens();
      clearSession();
      void queryClient.clear();
    },
    onError: () => {
      setDeleteModalVisible(false);
      setDangerError("Couldn't delete account. Try again.");
    },
  });

  const reminderTimeLabel = useMemo(() => {
    return notifQuery.data ? formatReminderTimeLabel(notifQuery.data.reminderTimeLocalHhmm) : "";
  }, [notifQuery.data]);

  const equipmentLabel = useMemo(() => {
    const presetCode = profileQuery.data?.equipmentPreset ?? null;
    if (!presetCode) return "Not set";
    return referenceDataQuery.data?.equipmentPresets.find((preset) => preset.code === presetCode)?.label ?? "Not set";
  }, [profileQuery.data?.equipmentPreset, referenceDataQuery.data?.equipmentPresets]);

  const referralStatsLabel = useMemo(() => {
    if (!referralStatsQuery.data || referralStatsQuery.data.totalReferrals <= 0) return null;
    const stats = referralStatsQuery.data;
    return `${stats.totalReferrals} referred · ${stats.conversions} converted${
      stats.rewardsGranted > 0 ? ` · ${stats.rewardsGranted} rewards` : ""
    }`;
  }, [referralStatsQuery.data]);

  const handleLogout = async (): Promise<void> => {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      void apiLogout(refreshToken).catch(() => {
        // ignore logout API errors; local logout should still complete
      });
    }
    await clearTokens();
    logOutPurchases();
    clearSession();
    void queryClient.clear();
  };

  const handleNotificationToggle = (
    key: (typeof NOTIFICATION_ROWS)[number]["key"],
    value: boolean,
  ): void => {
    notifMutation.mutate({ [key]: value });
  };

  const handleShareReferral = async (): Promise<void> => {
    const shareUrl = referralQuery.data?.shareUrl ?? "";
    if (!shareUrl) return;
    await Share.share({
      message: `Train smarter with Formai. Start your free trial: ${shareUrl}`,
      url: shareUrl,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {ent ? (
          <View style={styles.section}>
            <SectionLabel>SUBSCRIPTION</SectionLabel>
            <View style={settingsStyles.subscriptionCard}>
              <Text style={settingsStyles.subscriptionLabel}>Subscription</Text>
              <Text style={settingsStyles.subscriptionStatus}>
                {ent.subscription_status === "trialing"
                  ? `Free trial - ${ent.trial_days_remaining ?? 0} day${ent.trial_days_remaining !== 1 ? "s" : ""} remaining`
                  : ent.subscription_status === "active"
                    ? "Active subscription"
                    : ent.subscription_status === "cancelled"
                      ? "Cancelled - active until expiry"
                      : "Trial ended"}
              </Text>
              {!ent.is_active ? (
                <PressableScale
                  style={settingsStyles.subscribeButton}
                  onPress={() =>
                    tabNavigation.navigate("HomeTab", { screen: "Paywall" } as never)
                  }
                >
                  <Text style={settingsStyles.subscribeLabel}>Subscribe</Text>
                </PressableScale>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionLabel>NOTIFICATIONS</SectionLabel>
          <View style={styles.sectionCard}>
            {notifQuery.isLoading ? <SkeletonRows count={3} /> : null}
            {notifQuery.isError ? (
              <RetryRow
                label="Couldn't load notification settings - tap to retry"
                onPress={() => void notifQuery.refetch()}
              />
            ) : null}
            {notifQuery.data ? (
              <>
                {NOTIFICATION_ROWS.map((row, index) => {
                  const currentValue = notifQuery.data?.[row.key] ?? false;
                  const showDivider =
                    index < NOTIFICATION_ROWS.length - 1 || Boolean(notifQuery.data?.reminderEnabled);
                  return (
                    <PressableScale
                      key={row.key}
                      accessibilityLabel={row.label}
                      disabled={notifMutation.isPending}
                      onPress={() => handleNotificationToggle(row.key, !currentValue)}
                    >
                      <View style={[styles.row, showDivider ? styles.rowDivider : null]}>
                        <View style={styles.rowText}>
                          <Text style={styles.rowLabel}>{row.label}</Text>
                          <Text style={styles.rowDescription}>{row.description}</Text>
                        </View>
                        <Switch
                          accessibilityLabel={row.label}
                          value={currentValue}
                          onValueChange={(nextValue) => handleNotificationToggle(row.key, nextValue)}
                          disabled={notifMutation.isPending}
                          trackColor={{ false: colors.border, true: colors.accent }}
                          thumbColor={colors.textPrimary}
                        />
                      </View>
                    </PressableScale>
                  );
                })}
                {notifQuery.data.reminderEnabled ? (
                  <SettingsRow
                    label="Reminder Time"
                    value={reminderTimeLabel}
                    onPress={() =>
                      navigation.navigate("NotificationTime", {
                        currentTime: notifQuery.data?.reminderTimeLocalHhmm ?? "08:00",
                      })
                    }
                    showChevron
                  />
                ) : null}
              </>
            ) : null}
          </View>
          {notifSaveError ? <Text style={styles.inlineError}>{notifSaveError}</Text> : null}
        </View>

        <View style={styles.section}>
          <SectionLabel>ACCOUNT</SectionLabel>
          <View style={styles.sectionCard}>
            {accountQuery.isLoading ? <SkeletonRows count={2} /> : null}
            {accountQuery.isError ? (
              <RetryRow
                label="Couldn't load account settings - tap to retry"
                onPress={() => void accountQuery.refetch()}
              />
            ) : null}
            {accountQuery.data ? (
              <>
                <SettingsRow
                  label="Name"
                  value={accountQuery.data.displayName ?? "Not set"}
                  onPress={() =>
                    navigation.navigate("AccountName", {
                      currentName: accountQuery.data?.displayName ?? null,
                    })
                  }
                  showChevron
                  showDivider
                />
                <SettingsRow label="Email" value={accountQuery.data.email} showDivider />
                <SettingsRow
                  label="Change Password"
                  onPress={() => navigation.navigate("ChangePassword")}
                  showChevron
                />
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>REFERRALS</SectionLabel>
          <View style={styles.sectionCard}>
            {referralQuery.isLoading || referralStatsQuery.isLoading ? <SkeletonRows count={2} /> : null}
            {referralQuery.isError || referralStatsQuery.isError ? (
              <RetryRow
                label="Couldn't load referral info - tap to retry"
                onPress={() => {
                  void referralQuery.refetch();
                  void referralStatsQuery.refetch();
                }}
              />
            ) : null}
            {referralQuery.data ? (
              <>
                <SettingsRow
                  label="Your referral code"
                  description="Share Formai with a friend. Get a free month when they subscribe."
                  value={referralQuery.data.code}
                  showDivider
                />
                <SettingsRow
                  label="Share invite link"
                  description={referralStatsLabel ?? "Send your personal invite link."}
                  onPress={() => {
                    void handleShareReferral();
                  }}
                  showChevron
                />
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>PREFERENCES</SectionLabel>
          <View style={styles.sectionCard}>
            {preferredUnitQuery.isLoading || preferredHeightUnitQuery.isLoading || meQuery.isLoading || profileQuery.isLoading ? (
              <SkeletonRows count={2} />
            ) : null}
            {preferredUnitQuery.isError || preferredHeightUnitQuery.isError || profileQuery.isError ? (
              <RetryRow
                label="Couldn't load preferences - tap to retry"
                onPress={() => {
                  void preferredUnitQuery.refetch();
                  void preferredHeightUnitQuery.refetch();
                  void profileQuery.refetch();
                }}
              />
            ) : null}
            {preferredUnitQuery.data && preferredHeightUnitQuery.data ? (
              <>
                <SettingsRow
                  label="Units"
                  value={`${preferredUnitQuery.data} · ${preferredHeightUnitQuery.data}`}
                  onPress={() =>
                    navigation.navigate("UnitPicker", {
                      currentUnit: preferredUnitQuery.data ?? "kg",
                      currentHeightUnit: preferredHeightUnitQuery.data ?? "cm",
                    })
                  }
                  showChevron
                  showDivider
                />
                <SettingsRow
                  label="Equipment"
                  value={equipmentLabel}
                  onPress={() => navigation.navigate("EquipmentSettings")}
                  showChevron
                />
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>DANGER ZONE</SectionLabel>
          <View style={styles.sectionCard}>
            <SettingsRow
              label="Log Out"
              destructive
              onPress={() => void handleLogout()}
              showDivider
            />
            <SettingsRow
              label="Delete Account"
              destructive
              onPress={() => {
                setDangerError(null);
                setDeleteModalVisible(true);
              }}
            />
          </View>
          {dangerError ? <Text style={styles.inlineError}>{dangerError}</Text> : null}
        </View>
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete account</Text>
            <Text style={styles.modalBody}>
              This will permanently delete your account, all training history, and all program data.
              This cannot be undone.
            </Text>
            <PressableScale
              style={styles.modalSecondaryButton}
              disabled={deleteAccountMutation.isPending}
              onPress={() => setDeleteModalVisible(false)}
            >
              <Text style={styles.modalSecondaryLabel}>Cancel</Text>
            </PressableScale>
            <PressableScale
              style={styles.modalDangerButton}
              disabled={deleteAccountMutation.isPending}
              onPress={() => deleteAccountMutation.mutate()}
            >
              <Text style={styles.modalDangerLabel}>
                {deleteAccountMutation.isPending ? "Deleting..." : "Delete my account"}
              </Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
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
  },
  content: {
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
    paddingHorizontal: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.textSecondary,
    ...typography.label,
    textTransform: "uppercase",
    paddingHorizontal: spacing.md,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.md,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  rowLabel: {
    color: colors.textPrimary,
    ...typography.body,
  },
  destructiveLabel: {
    color: colors.error,
  },
  rowDescription: {
    color: colors.textSecondary,
    ...typography.small,
  },
  rowValue: {
    color: colors.textSecondary,
    ...typography.small,
  },
  skeletonRow: {
    opacity: 0.4,
    backgroundColor: colors.textSecondary,
  },
  retryRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  retryText: {
    color: colors.error,
    ...typography.small,
  },
  inlineError: {
    color: colors.error,
    ...typography.small,
    paddingHorizontal: spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  modalBody: {
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 20,
  },
  modalSecondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  modalSecondaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  modalDangerButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  modalDangerLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
});

const settingsStyles = StyleSheet.create({
  subscriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    width: "100%",
    marginHorizontal: spacing.md,
  },
  subscriptionLabel: {
    color: colors.textSecondary,
    ...typography.label,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  subscriptionStatus: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  subscribeButton: {
    marginTop: spacing.xs,
    minHeight: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  subscribeLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
  },
});
