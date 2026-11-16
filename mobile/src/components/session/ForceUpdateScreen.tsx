import React, { useEffect, useState } from "react";
import { BackHandler, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { BRAND_WORDMARK } from "../../config/brand";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { PressableScale } from "../interaction/PressableScale";

export function ForceUpdateScreen({ updateUrl }: { updateUrl: string | null }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [updateUrl]);
  useEffect(() => { const handler = BackHandler.addEventListener("hardwareBackPress", () => true); return () => handler.remove(); }, []);
  return <View style={styles.root}>
    <Text accessibilityRole="header" style={styles.title}>Update required</Text>
    <Text style={styles.body}>{`This version of ${BRAND_WORDMARK} is no longer supported. Update to keep training. Your workouts and progress are saved to your account.`}</Text>
    {updateUrl && !failed ? <PressableScale accessibilityLabel="Update" style={styles.primary}
      onPress={() => { void Linking.openURL(updateUrl).catch(() => setFailed(true)); }}>
      <Text style={styles.primaryText}>Update</Text>
    </PressableScale> : <Text style={styles.body}>{`Open the ${Platform.OS === "android" ? "Google Play" : "App Store"} and update ${BRAND_WORDMARK}.`}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: spacing.xl, gap: spacing.lg },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: "center" },
  body: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  primary: { backgroundColor: colors.accent, padding: spacing.md, borderRadius: radii.card, alignItems: "center" },
  primaryText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
});
