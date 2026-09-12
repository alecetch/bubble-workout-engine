import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";

type ExerciseMediaThumbProps = {
  stillImageUrl: string;
  videoUrl: string | null;
  posterImageUrl: string | null;
  videoStatus: string;
};

type Mode = "mini" | "expanded" | "fullscreen";

export function ExerciseMediaThumb({
  stillImageUrl,
  videoUrl,
  posterImageUrl,
  videoStatus,
}: ExerciseMediaThumbProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("mini");
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const playableVideoUrl = videoStatus === "ready" && videoUrl ? videoUrl : null;
  const posterSource = posterImageUrl || stillImageUrl;
  const player = useVideoPlayer(playableVideoUrl, (instance) => {
    instance.loop = true;
    instance.muted = true;
    if (playableVideoUrl) instance.play();
  });

  if (!playableVideoUrl || mode === "mini") {
    const image = (
      <View style={styles.miniFrame} testID="exercise-media-thumb">
        <Image source={{ uri: stillImageUrl }} style={styles.miniImage} resizeMode="cover" />
        {playableVideoUrl ? (
          <View style={styles.playBadge} testID="exercise-media-play-badge">
            <Ionicons name="play" size={12} color={colors.textPrimary} />
          </View>
        ) : null}
      </View>
    );

    if (!playableVideoUrl) return image;

    return (
      <Pressable
        onPress={() => {
          setHasFirstFrame(false);
          setMode("expanded");
        }}
        accessibilityRole="button"
        accessibilityLabel="Play exercise video"
      >
        {image}
      </Pressable>
    );
  }

  const playerView = (
    <View style={styles.playerShell} testID={mode === "fullscreen" ? "exercise-media-fullscreen" : "exercise-media-expanded"}>
      {!hasFirstFrame && posterSource ? (
        <Image source={{ uri: posterSource }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        onFirstFrameRender={() => setHasFirstFrame(true)}
        testID="exercise-media-video"
      />
      <Pressable
        style={[styles.control, styles.minimizeControl]}
        onPress={() => setMode("mini")}
        accessibilityRole="button"
        accessibilityLabel="Minimize exercise video"
      >
        <Ionicons name="remove-outline" size={18} color={colors.textPrimary} />
      </Pressable>
      <Pressable
        style={[styles.control, styles.fullscreenControl]}
        onPress={() => setMode("fullscreen")}
        accessibilityRole="button"
        accessibilityLabel="Open exercise video fullscreen"
      >
        <Ionicons name="expand-outline" size={18} color={colors.textPrimary} />
      </Pressable>
    </View>
  );

  if (mode === "fullscreen") {
    return (
      <Modal
        visible
        transparent={false}
        animationType="fade"
        onRequestClose={() => setMode("expanded")}
      >
        <View style={styles.fullscreenModal}>
          <View style={styles.fullscreenPlayer}>{playerView}</View>
          <Pressable
            style={[styles.control, styles.closeControl]}
            onPress={() => setMode("expanded")}
            accessibilityRole="button"
            accessibilityLabel="Close exercise video fullscreen"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </Modal>
    );
  }

  return playerView;
}

const styles = StyleSheet.create({
  miniFrame: {
    width: 56,
    height: 56,
    borderRadius: radii.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  miniImage: {
    width: "100%",
    height: "100%",
  },
  playBadge: {
    position: "absolute",
    right: 3,
    bottom: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },
  playerShell: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radii.card,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  control: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.78)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  minimizeControl: {
    top: spacing.sm,
    right: spacing.sm,
  },
  fullscreenControl: {
    right: spacing.sm,
    bottom: spacing.sm,
  },
  fullscreenModal: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  fullscreenPlayer: {
    width: "100%",
  },
  closeControl: {
    // Top-left, not top-right: Expo's floating dev-menu bubble sits top-right
    // in Expo Go / dev-client, and previously covered this button entirely.
    top: spacing.lg,
    left: spacing.lg,
  },
});
