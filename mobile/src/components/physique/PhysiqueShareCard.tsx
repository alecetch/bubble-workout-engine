import React from "react";
import { StyleSheet, Text, View } from "react-native";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import type { ScanResult } from "../../api/physiqueScan";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

let currentCaptureRef: ViewShot | null = null;
let currentScanId: string | null = null;

function formatDelta(value: number | null): string {
  if (value == null) return "First score";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export async function captureAndShare(scanResult: ScanResult): Promise<void> {
  if (!currentCaptureRef || currentScanId !== scanResult.scan_id) {
    throw new Error("Share card is not ready yet.");
  }
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Sharing is not available on this device.");
  }
  const path = await currentCaptureRef.capture?.();
  if (!path) {
    throw new Error("Unable to generate share card.");
  }
  await Sharing.shareAsync(path);
}

export function PhysiqueShareCard({ scanResult }: { scanResult: ScanResult }): React.JSX.Element {
  const viewShotRef = React.useRef<ViewShot | null>(null);

  React.useEffect(() => {
    currentCaptureRef = viewShotRef.current;
    currentScanId = scanResult.scan_id;
    return () => {
      if (currentScanId === scanResult.scan_id) {
        currentCaptureRef = null;
        currentScanId = null;
      }
    };
  }, [scanResult.scan_id]);

  return (
    <View style={styles.hiddenCanvas}>
      <ViewShot ref={viewShotRef} options={{ format: "png", quality: 1 }} style={styles.canvas}>
        <View style={styles.card}>
          <Text style={styles.brand}>Formai</Text>
          <Text style={styles.label}>Physique Score</Text>
          <Text style={styles.score}>{scanResult.physique_score.toFixed(1)}</Text>
          <View style={styles.deltaChip}>
            <Text style={styles.deltaLabel}>{formatDelta(scanResult.score_delta)}</Text>
          </View>
          <View style={styles.observationList}>
            {scanResult.observations.slice(0, 2).map((item) => (
              <Text key={item} style={styles.observation}>
                • {item}
              </Text>
            ))}
          </View>
          <Text style={styles.tagline}>Track your physique at formai.app</Text>
        </View>
      </ViewShot>
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenCanvas: {
    position: "absolute",
    left: -9999,
    top: 0,
  },
  canvas: {
    width: 1080,
    height: 1080,
  },
  card: {
    flex: 1,
    backgroundColor: "#0B1120",
    borderRadius: radii.card,
    padding: 96,
    justifyContent: "space-between",
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 52,
    fontWeight: "800",
  },
  label: {
    color: colors.textSecondary,
    fontSize: 28,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  score: {
    color: colors.textPrimary,
    fontSize: 180,
    fontWeight: "800",
  },
  deltaChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(59,130,246,0.18)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.5)",
  },
  deltaLabel: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  observationList: {
    gap: spacing.md,
  },
  observation: {
    color: colors.textPrimary,
    fontSize: 34,
    lineHeight: 44,
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: 24,
    textAlign: "center",
  },
});
