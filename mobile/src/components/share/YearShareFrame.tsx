import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { BRAND_DOMAIN, BRAND_WORDMARK } from "../../config/brand";
import { colors } from "../../theme/colors";

// Logical 360 x 640, captured at 3x for a 1080 x 1920 Story.
export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 640;

export function YearShareFrame({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.frame} testID="year-share-frame">
    <View style={styles.brand}><View style={styles.mark} /><Text style={styles.wordmark} allowFontScaling={false}>{BRAND_WORDMARK}</Text></View>
    <View style={styles.content}>{children}</View>
    <Text style={styles.domain} allowFontScaling={false}>{BRAND_DOMAIN}</Text>
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 84, paddingBottom: 84, justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 8, height: 24, borderRadius: 4, backgroundColor: colors.accent },
  wordmark: { color: colors.textPrimary, fontSize: 22, fontWeight: "700" },
  content: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  domain: { color: colors.textSecondary, fontSize: 13, letterSpacing: 1 },
});
