import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
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
  const opacity = useSharedValue(heroMedia ? 0 : 1);

  useEffect(() => {
    if (heroMedia) {
      opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) });
    }
  }, [heroMedia, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!heroMedia) {
    return (
      <View style={[styles.container, styles.containerNoMedia]}>
        <Text style={styles.title}>{title}</Text>
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Animated.Image
        source={{ uri: heroMedia }}
        style={[StyleSheet.absoluteFill, styles.image]}
        resizeMode="cover"
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
    </Animated.View>
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
