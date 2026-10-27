import React, { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { CachedImage } from "../media/CachedImage";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";

type ExerciseMediaThumbProps = {
  stillImageUrl: string;
  stillThumbUrl?: string | null;
  stillThumbhash?: string | null;
  posterCardUrl?: string | null;
  videoUrl: string | null;
  posterImageUrl: string | null;
  videoStatus: string;
};

type Mode = "mini" | "expanded" | "fullscreen";

export function ExerciseMediaThumb({
  stillImageUrl,
  stillThumbUrl,
  stillThumbhash,
  posterCardUrl,
  videoUrl,
  posterImageUrl,
  videoStatus,
}: ExerciseMediaThumbProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("mini");
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const sourceLoadedRef = useRef(false);
  const mountedRef = useRef(false);
  const playbackRequestedRef = useRef(false);
  const playableVideoUrl = videoStatus === "ready" && videoUrl ? videoUrl : null;
  const sourceUrlRef = useRef(playableVideoUrl);
  const posterSource = posterCardUrl || posterImageUrl || stillImageUrl;
  const player = useVideoPlayer(null, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      playbackRequestedRef.current = false;
    };
  }, []);

  // replaceAsync resolves once the source is set, not once it has loaded, so a
  // network failure only surfaces later as an "error" status. Treat that as an
  // unloaded source so the next tap retries instead of replaying a dead player.
  // Clearing the source also stops the native view briefly showing its
  // "cannot play" glyph when the retry expands the player.
  useEffect(() => {
    const subscription = player.addListener("statusChange", ({ status }) => {
      if (status !== "error" || !mountedRef.current) return;
      sourceLoadedRef.current = false;
      playbackRequestedRef.current = false;
      setHasFirstFrame(false);
      setMode("mini");
      player.replaceAsync(null).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    if (sourceUrlRef.current === playableVideoUrl) return;
    sourceUrlRef.current = playableVideoUrl;
    sourceLoadedRef.current = false;
    playbackRequestedRef.current = false;
    player.pause();
    setHasFirstFrame(false);
    setMode("mini");
  }, [playableVideoUrl, player]);

  async function playVideo() {
    if (!playableVideoUrl) return;
    playbackRequestedRef.current = true;
    setHasFirstFrame(false);
    setMode("expanded");
    try {
      if (!sourceLoadedRef.current) {
        await player.replaceAsync(playableVideoUrl);
        if (!mountedRef.current || sourceUrlRef.current !== playableVideoUrl) return;
        sourceLoadedRef.current = true;
      }
      if (mountedRef.current && playbackRequestedRef.current) player.play();
    } catch {
      if (!mountedRef.current || sourceUrlRef.current !== playableVideoUrl) return;
      sourceLoadedRef.current = false;
      playbackRequestedRef.current = false;
      setMode("mini");
    }
  }

  if (!playableVideoUrl || mode === "mini") {
    const image = (
      <View style={styles.miniFrame} testID="exercise-media-thumb">
        <CachedImage uri={stillThumbUrl || stillImageUrl} thumbhash={stillThumbhash}
          recyclingKey={stillThumbUrl || stillImageUrl} style={styles.miniImage} />
        {playableVideoUrl ? (
          <View style={styles.playOverlay} pointerEvents="none" testID="exercise-media-play-overlay">
            <View style={styles.playBadge} testID="exercise-media-play-badge">
              <Ionicons name="play" size={16} color={colors.textPrimary} />
            </View>
          </View>
        ) : null}
      </View>
    );

    if (!playableVideoUrl) return image;

    return (
      <Pressable
        onPress={playVideo}
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
        <CachedImage uri={posterSource} thumbhash={stillThumbhash} style={StyleSheet.absoluteFill} />
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
        onPress={() => {
          playbackRequestedRef.current = false;
          player.pause();
          setMode("mini");
        }}
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
  playOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  playBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.78)",
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
