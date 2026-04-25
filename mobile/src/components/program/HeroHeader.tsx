import React from "react";
import { ImageBackground, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type HeroHeaderProps = {
  title: string;
  summary?: string;
  heroMedia?: string | null;
};

export function HeroHeader({ title, summary, heroMedia }: HeroHeaderProps): React.JSX.Element {
  const hasMedia = Boolean(heroMedia);

  if (!hasMedia) {
    return (
      <View style={[styles.container, styles.containerNoMedia]}>
        <Text style={styles.title}>{title}</Text>
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      </View>
    );
  }

  return (
    <ImageBackground source={{ uri: heroMedia ?? "" }} style={styles.container} imageStyle={styles.image}>
      <View style={styles.overlay} />
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 164,
    borderRadius: radii.card,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: colors.surface,
  },
  containerNoMedia: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: "center",
  },
  image: {
    borderRadius: radii.card,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.56)",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  summary: {
    color: colors.textPrimary,
    ...typography.body,
  },
});
