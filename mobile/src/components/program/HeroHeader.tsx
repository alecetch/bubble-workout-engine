import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CachedImage } from "../media/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type HeroHeaderProps = {
  title: string;
  summary?: string;
  heroMedia?: string | null;
  heroMediaThumbhash?: string | null;
};

export function HeroHeader({ title, summary, heroMedia, heroMediaThumbhash }: HeroHeaderProps): React.JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [heroMedia]);

  if (!heroMedia || imageFailed) {
    return (
      <View style={[styles.container, styles.containerNoMedia]}>
        <Text style={styles.title}>{title}</Text>
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CachedImage
        uri={heroMedia}
        thumbhash={heroMediaThumbhash}
        transitionMs={300}
        style={[StyleSheet.absoluteFill, styles.image]}
        onError={() => setImageFailed(true)}
      />
      <View
        testID="hero-image-tint"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.tint]}
      />
      <LinearGradient
        colors={["transparent", "rgba(15,23,42,0.55)", "rgba(15,23,42,0.90)"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      </View>
    </View>
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
  tint: {
    backgroundColor: colors.heroImageTint,
    borderRadius: radii.card,
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
