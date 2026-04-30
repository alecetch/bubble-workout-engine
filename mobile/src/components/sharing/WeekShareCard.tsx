import React from "react";
import { StyleSheet, Text, View } from "react-native";

type WeekShareCardProps = {
  weekNumber: number;
  sessionsCompleted: number;
  totalVolumeKg: number;
  cardRef: React.RefObject<View | null>;
};

export function WeekShareCard({
  weekNumber,
  sessionsCompleted,
  totalVolumeKg,
  cardRef,
}: WeekShareCardProps): React.JSX.Element {
  const volumeDisplay =
    totalVolumeKg >= 1000
      ? `${(totalVolumeKg / 1000).toFixed(1)}t`
      : `${Math.round(totalVolumeKg).toLocaleString()} kg`;

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={cardRef} style={styles.card} collapsable={false}>
        <View style={styles.topBar}>
          <Text style={styles.brandName}>Formai</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.weekDoneLabel}>Week Done</Text>
          <Text style={styles.weekNumber}>Week {weekNumber}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{sessionsCompleted}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{volumeDisplay}</Text>
              <Text style={styles.statLabel}>Volume lifted</Text>
            </View>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.tagline}>Training with Formai</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: "absolute",
    left: -1080,
    top: 0,
    width: 1080,
    height: 1080,
  },
  card: {
    width: 1080,
    height: 1080,
    backgroundColor: "#0F172A",
    padding: 80,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandName: {
    color: "#F1F5F9",
    fontSize: 48,
    fontWeight: "800",
    letterSpacing: -1,
  },
  body: {
    gap: 32,
    alignItems: "flex-start",
  },
  weekDoneLabel: {
    color: "#22C55E",
    fontSize: 36,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  weekNumber: {
    color: "#F1F5F9",
    fontSize: 96,
    fontWeight: "800",
    lineHeight: 100,
  },
  statsRow: {
    flexDirection: "row",
    gap: 48,
    alignItems: "center",
  },
  statBlock: {
    gap: 8,
  },
  statDivider: {
    width: 2,
    height: 80,
    backgroundColor: "#334155",
  },
  statValue: {
    color: "#F1F5F9",
    fontSize: 72,
    fontWeight: "800",
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 32,
  },
  footer: {
    alignItems: "flex-end",
  },
  tagline: {
    color: "#475569",
    fontSize: 28,
  },
});
