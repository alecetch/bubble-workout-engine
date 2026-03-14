import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { PressableScale } from "../../components/interaction/PressableScale";
import { SkeletonOnboarding } from "../../components/onboarding/SkeletonOnboarding";
import {
  useClientProfile,
  useCreateClientProfile,
  useLinkClientProfileToUser,
  useMe,
  useReferenceData,
} from "../../api/hooks";
import { getApiDiagnostics } from "../../api/client";
import { getResumeStep } from "../../state/onboarding/resumeLogic";
import { getOnboardingDraft, useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Props = NativeStackScreenProps<OnboardingStackParamList, "OnboardingEntry">;

export function OnboardingEntry({ navigation }: Props): React.JSX.Element {
  const queryClient = useQueryClient();

  const resetFromProfile = useOnboardingStore((state) => state.resetFromProfile);
  const setDraft = useOnboardingStore((state) => state.setDraft);
  const setIdentity = useOnboardingStore((state) => state.setIdentity);

  const meQuery = useMe();
  const referenceDataQuery = useReferenceData();

  const profileId = meQuery.data?.clientProfileId ?? null;
  const profileQuery = useClientProfile(profileId);

  const createClientProfileMutation = useCreateClientProfile();
  const linkClientProfileMutation = useLinkClientProfileToUser();

  const [fatalError, setFatalError] = useState<string | null>(null);

  const bootstrappingRef = useRef(false);
  const hydratedRef = useRef(false);
  const createdProfileIdRef = useRef<string | null>(null);

  const isAnyLoading =
    meQuery.isLoading ||
    referenceDataQuery.isLoading ||
    createClientProfileMutation.isPending ||
    linkClientProfileMutation.isPending ||
    (Boolean(profileId) && profileQuery.isLoading);

  // DEBUG: remove once boot hang is resolved
  console.log("[boot:render]", {
    meLoading: meQuery.isLoading,
    meSuccess: meQuery.isSuccess,
    meError: meQuery.isError,
    clientProfileId: meQuery.data?.clientProfileId ?? null,
    refLoading: referenceDataQuery.isLoading,
    refSuccess: referenceDataQuery.isSuccess,
    createPending: createClientProfileMutation.isPending,
    linkPending: linkClientProfileMutation.isPending,
    profileId: profileId ?? null,
    profileLoading: profileQuery.isLoading,
    profileHasData: !!profileQuery.data,
    isAnyLoading,
  });

  const queryErrorMessage = useMemo(() => {
    const err = fatalError || meQuery.error?.message || referenceDataQuery.error?.message || profileQuery.error?.message;
    return err ?? null;
  }, [fatalError, meQuery.error?.message, profileQuery.error?.message, referenceDataQuery.error?.message]);
  const apiDiagnostics = useMemo(() => getApiDiagnostics(), [queryErrorMessage]);

  const bootstrapProfileIfNeeded = useCallback(async (): Promise<void> => {
    // DEBUG: remove once boot hang is resolved
    console.log("[boot:bootstrap-fn]", {
      hasData: !!meQuery.data,
      clientProfileId: meQuery.data?.clientProfileId ?? null,
      alreadyBootstrapping: bootstrappingRef.current,
    });
    if (!meQuery.data) return;
    if (meQuery.data.clientProfileId) return;
    if (bootstrappingRef.current) return;

    bootstrappingRef.current = true;
    try {
      console.log("[boot:bootstrap-fn] → POST /client-profiles");
      const createdProfileId =
        createdProfileIdRef.current ??
        (
          await createClientProfileMutation.mutateAsync({
            // TODO: Send explicit server-required defaults if API contract tightens.
          })
        ).id;

      createdProfileIdRef.current = createdProfileId;
      console.log("[boot:bootstrap-fn] → PATCH /users/me", { createdProfileId });
      await linkClientProfileMutation.mutateAsync({ clientProfileId: createdProfileId });
      console.log("[boot:bootstrap-fn] → refetch /me");
      await meQuery.refetch();
      console.log("[boot:bootstrap-fn] done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to bootstrap client profile.";
      console.log("[boot:bootstrap-fn] ERROR", message);
      setFatalError(message);
    } finally {
      bootstrappingRef.current = false;
    }
  }, [createClientProfileMutation, linkClientProfileMutation, meQuery]);

  useEffect(() => {
    if (!meQuery.data?.id) return;
    setIdentity({
      userId: meQuery.data.id,
      clientProfileId: meQuery.data.clientProfileId ?? null,
    });
  }, [meQuery.data?.clientProfileId, meQuery.data?.id, setIdentity]);

  useEffect(() => {
    // DEBUG: remove once boot hang is resolved
    console.log("[boot:bootstrap-effect]", { meIsError: meQuery.isError, meIsSuccess: meQuery.isSuccess });
    if (meQuery.isError) {
      setFatalError(meQuery.error?.message ?? "Failed to load /me.");
      return;
    }

    if (!meQuery.isSuccess) return;

    void bootstrapProfileIfNeeded();
  }, [bootstrapProfileIfNeeded, meQuery.error?.message, meQuery.isError, meQuery.isSuccess]);

  useEffect(() => {
    // DEBUG: remove once boot hang is resolved
    console.log("[boot:hydrate-effect]", {
      alreadyHydrated: hydratedRef.current,
      meSuccess: meQuery.isSuccess,
      refSuccess: referenceDataQuery.isSuccess,
      profileId: profileId ?? null,
      profileHasData: !!profileQuery.data,
    });
    if (hydratedRef.current) return;
    if (!meQuery.isSuccess || !referenceDataQuery.isSuccess) return;
    if (!profileId || !profileQuery.data) return;

    console.log("[boot:hydrate-effect] ALL CONDITIONS MET — hydrating");
    resetFromProfile(profileQuery.data);

    const hydratedDraft = getOnboardingDraft();
    const resumeStep = getResumeStep(hydratedDraft);

    hydratedRef.current = true;

    // DEBUG: remove once boot hang is resolved
    console.log("[boot:navigate]", { resumeStep });

    if (resumeStep === 1) {
      navigation.replace("Step1Goals");
      return;
    }
    if (resumeStep === 2) {
      navigation.replace("Step2Equipment");
      return;
    }
    if (resumeStep === 3) {
      navigation.replace("Step3Schedule");
      return;
    }
    if (resumeStep === "done") {
      navigation.replace("ProgramReview");
      return;
    }

    navigation.replace("Step3Schedule");
  }, [
    meQuery.isSuccess,
    navigation,
    profileId,
    profileQuery.data,
    referenceDataQuery.isSuccess,
    resetFromProfile,
    setDraft,
  ]);

  const handleRetry = useCallback(async (): Promise<void> => {
    setFatalError(null);
    hydratedRef.current = false;
    bootstrappingRef.current = false;

    await Promise.all([
      meQuery.refetch(),
      referenceDataQuery.refetch(),
      profileId ? profileQuery.refetch() : Promise.resolve(),
    ]);

    if (profileId) {
      await queryClient.invalidateQueries({ queryKey: ["clientProfile", profileId] });
    }
  }, [meQuery, profileId, profileQuery, queryClient, referenceDataQuery]);

  if (queryErrorMessage) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{queryErrorMessage}</Text>
        <Text style={styles.errorMeta}>Last URL: {apiDiagnostics.lastAttemptedUrl ?? "Unknown"}</Text>
        <Text style={styles.errorMeta}>Last error: {apiDiagnostics.lastErrorMessage ?? queryErrorMessage}</Text>
        <PressableScale
          style={styles.retryButton}
          onPress={() => {
            void handleRetry();
          }}
        >
          <Text style={styles.retryLabel}>Retry</Text>
        </PressableScale>
      </View>
    );
  }

  if (isAnyLoading || !profileId || !profileQuery.data || !referenceDataQuery.data) {
    return (
      <View style={styles.loadingContainer}>
        <SkeletonOnboarding />
        <Text style={styles.loadingText}>Preparing onboarding...</Text>
      </View>
    );
  }

  return (
    <View style={styles.loadingContainer}>
      <SkeletonOnboarding />
      <Text style={styles.loadingText}>Routing...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: "center",
    gap: spacing.lg,
  },
  loadingText: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  errorTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  errorText: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  errorMeta: {
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 48,
    minWidth: 128,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  retryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
});
