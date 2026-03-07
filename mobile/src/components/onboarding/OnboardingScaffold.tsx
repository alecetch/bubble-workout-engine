import React from "react";
import type { RefObject } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { ProgressHeader } from "./ProgressHeader";
import { StickyNavBar } from "./StickyNavBar";
import { ErrorBanner } from "./ErrorBanner";

type OnboardingScaffoldProps = {
  step: 1 | 2 | 3;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  errorBannerVisible: boolean;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled: boolean;
  isSaving: boolean;
  scrollViewRef?: RefObject<ScrollView | null>;
};

const NAV_BAR_HEIGHT = 92;

export function OnboardingScaffold({
  step,
  title,
  subtitle,
  children,
  errorBannerVisible,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  isSaving,
  scrollViewRef,
}: OnboardingScaffoldProps): React.JSX.Element {
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
    >
      <View style={styles.topBlock}>
        <ProgressHeader step={step} />
        <ErrorBanner visible={errorBannerVisible} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.content}>{children}</View>
      </ScrollView>

      <StickyNavBar
        onBack={onBack}
        onNext={onNext}
        nextLabel={nextLabel}
        nextDisabled={nextDisabled}
        isSaving={isSaving}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: NAV_BAR_HEIGHT + spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    ...typography.body,
  },
  content: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
});
