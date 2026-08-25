import React from "react";
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { API_BASE_URL } from "../../api/config";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export async function openLegalUrl(path: "/terms" | "/privacy"): Promise<void> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error("unsupported");
    await Linking.openURL(url);
  } catch {
    Alert.alert("Unable to open link", "Please try again, or visit the site in your browser.");
  }
}

export function LegalLinksRow(): React.JSX.Element {
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => void openLegalUrl("/terms")}>
        <Text style={styles.link}>Terms of Service</Text>
      </TouchableOpacity>
      <Text style={styles.separator}>·</Text>
      <TouchableOpacity onPress={() => void openLegalUrl("/privacy")}>
        <Text style={styles.link}>Privacy Policy</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
  },
  link: {
    color: colors.textSecondary,
    ...typography.small,
    textDecorationLine: "underline",
  },
  separator: {
    color: colors.textSecondary,
    ...typography.small,
  },
});
