import React, { useEffect, useState } from "react";
import { Alert, Modal, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import {
  getCrashReportingEnvironment,
  isCrashReportingEnabled,
  sendTestError,
  triggerNativeCrash,
} from "../../lib/crashReporting";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = { visible: boolean; onClose: () => void };

export function DiagnosticsSheet({ visible, onClose }: Props): React.JSX.Element {
  const [sent, setSent] = useState(false);
  const enabled = isCrashReportingEnabled();
  useEffect(() => {
    if (!visible) setSent(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">Diagnostics</Text>
          <Text style={styles.text}>Crash reporting: {enabled ? "on" : "off (no DSN in this build)"}</Text>
          <Text style={styles.text}>Environment: {getCrashReportingEnvironment()}</Text>
          {!enabled ? <Text style={styles.text}>Test controls require crash reporting to be enabled in this build.</Text> : null}
          <PressableScale
            accessibilityLabel="Send test error"
            disabled={!enabled}
            accessibilityState={{ disabled: !enabled }}
            style={[styles.button, !enabled && styles.disabled]}
            onPress={() => {
              sendTestError();
              setSent(true);
            }}
          >
            <Text style={styles.text}>Send test error</Text>
          </PressableScale>
          {sent ? <Text style={styles.text} accessibilityLiveRegion="polite">Test error sent</Text> : null}
          <PressableScale
            accessibilityLabel="Test native crash"
            disabled={!enabled}
            accessibilityState={{ disabled: !enabled }}
            style={[styles.button, !enabled && styles.disabled]}
            onPress={() => Alert.alert("Test native crash", "This will close the app. Continue?", [
              { text: "Cancel", style: "cancel" },
              { text: "Crash", style: "destructive", onPress: triggerNativeCrash },
            ])}
          >
            <Text style={styles.text}>Test native crash</Text>
          </PressableScale>
          <PressableScale accessibilityLabel="Close diagnostics" style={styles.button} onPress={onClose}>
            <Text style={styles.text}>Close</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.72)" },
  sheet: { backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  title: { color: colors.textPrimary, ...typography.h3 },
  text: { color: colors.textPrimary, ...typography.body },
  button: { minHeight: 48, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.sm },
  disabled: { opacity: 0.45 },
});
