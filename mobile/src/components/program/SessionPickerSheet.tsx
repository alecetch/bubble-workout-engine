import React from "react";
import {
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { SessionsByDateItem } from "../../api/activePrograms";
import { colors } from "../../theme/colors";

const PROGRAM_TYPE_COLORS: Record<string, string> = {
  strength: "#3B82F6",
  hypertrophy: "#22C55E",
  conditioning: "#F59E0B",
  hyrox: "#EF4444",
};

type SessionPickerSheetProps = {
  visible: boolean;
  scheduledDate: string;
  sessions: SessionsByDateItem[];
  onSelectSession: (programDayId: string) => void;
  onClose: () => void;
};

export function SessionPickerSheet({
  visible,
  scheduledDate,
  sessions,
  onSelectSession,
  onClose,
}: SessionPickerSheetProps): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1} />
      <SafeAreaView style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.dateHeader}>{scheduledDate}</Text>
        <Text style={styles.subtitle}>Choose a session</Text>
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.program_day_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.sessionCard}
              onPress={() => {
                onClose();
                onSelectSession(item.program_day_id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.program_title}: ${item.day_label}`}
            >
              <View
                style={[
                  styles.typeBar,
                  { backgroundColor: PROGRAM_TYPE_COLORS[item.program_type] ?? "#6B7280" },
                ]}
              />
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionTitle}>{item.program_title}</Text>
                <Text style={styles.sessionLabel}>{item.day_label}</Text>
                {item.session_duration_mins != null ? (
                  <Text style={styles.sessionMeta}>{item.session_duration_mins} min</Text>
                ) : null}
                {item.is_completed ? (
                  <Text style={styles.completedBadge}>Completed</Text>
                ) : null}
              </View>
              {item.is_primary_program ? <Text style={styles.primaryIndicator}>*</Text> : null}
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: "70%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginVertical: 12,
  },
  dateHeader: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  list: {
    gap: 10,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeBar: {
    width: 4,
    alignSelf: "stretch",
  },
  sessionInfo: {
    flex: 1,
    padding: 12,
    gap: 2,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  sessionLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  sessionMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  completedBadge: {
    fontSize: 12,
    color: "#22C55E",
    fontWeight: "600",
  },
  primaryIndicator: {
    color: colors.accent,
    fontSize: 18,
    paddingRight: 12,
  },
});
