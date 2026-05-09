import React from "react";
import { StyleSheet, Text, View } from "react-native";

type PRShareCardProps = {
  exerciseName: string;
  e1rmKg: number;
  dateLabel: string;
  cardRef: React.RefObject<View | null>;
};

const CARD_SIZE = 1080;

export function PRShareCard({
  exerciseName,
  e1rmKg,
  dateLabel,
  cardRef,
}: PRShareCardProps): React.JSX.Element {
  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={cardRef} style={styles.card} collapsable={false}>
        <View style={styles.topBar}>
          <Text style={styles.brandName}>Formai</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.prLabel}>Personal Record</Text>
          <Text style={styles.exerciseName}>{exerciseName}</Text>
          <Text style={styles.e1rmValue}>{e1rmKg.toFixed(1)} kg</Text>
          <Text style={styles.e1rmSub}>Estimated 1RM</Text>
        </View>
        <View style={styles.footer}>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
          <Text style={styles.tagline}>Training with Formai</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: "absolute",
    left: -CARD_SIZE,
    top: 0,
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
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
    gap: 24,
    alignItems: "flex-start",
  },
  prLabel: {
    color: "#3B82F6",
    fontSize: 36,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  exerciseName: {
    color: "#F1F5F9",
    fontSize: 72,
    fontWeight: "800",
    lineHeight: 80,
  },
  e1rmValue: {
    color: "#3B82F6",
    fontSize: 120,
    fontWeight: "800",
    lineHeight: 120,
  },
  e1rmSub: {
    color: "#94A3B8",
    fontSize: 36,
    fontWeight: "400",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  dateLabel: {
    color: "#94A3B8",
    fontSize: 30,
  },
  tagline: {
    color: "#475569",
    fontSize: 28,
  },
});
