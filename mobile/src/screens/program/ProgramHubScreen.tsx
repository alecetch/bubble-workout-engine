import React from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  fetchActivePrograms,
  fetchCombinedCalendar,
  fetchSessionsByDate,
  setPrimaryProgram,
  type ActiveProgramSummary,
  type CalendarDay,
  type SessionsByDateItem,
  type TodaySession,
} from "../../api/activePrograms";
import { CombinedCalendar } from "../../components/program/CombinedCalendar";
import { SessionPickerSheet } from "../../components/program/SessionPickerSheet";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";

const PROGRAM_TYPE_COLORS: Record<string, string> = {
  strength: "#3B82F6",
  hypertrophy: "#22C55E",
  conditioning: "#F59E0B",
  hyrox: "#EF4444",
};

function typeBadgeColor(programType: string): string {
  return PROGRAM_TYPE_COLORS[programType] ?? "#6B7280";
}

function ProgramCard({
  program,
  onPress,
  onMakePrimary,
}: {
  program: ActiveProgramSummary;
  onPress: (programId: string) => void;
  onMakePrimary: (programId: string) => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.card, program.is_primary && styles.primaryCard]}
      onPress={() => onPress(program.program_id)}
      accessibilityRole="button"
      accessibilityLabel={`${program.program_title}, ${program.is_primary ? "primary" : "secondary"} program`}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: typeBadgeColor(program.program_type) }]}>
          <Text style={styles.typeBadgeText}>{program.program_type.toUpperCase()}</Text>
        </View>
        {program.is_primary ? (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>PRIMARY</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.cardTitle}>{program.program_title}</Text>
      <Text style={styles.cardMeta}>
        {program.weeks_count}w · {program.days_per_week}x/week
      </Text>
      {program.next_session_date ? (
        <Text style={styles.cardMeta}>Next: {program.next_session_date}</Text>
      ) : null}

      {!program.is_primary ? (
        <TouchableOpacity
          style={styles.makePrimaryBtn}
          onPress={() => onMakePrimary(program.program_id)}
          accessibilityRole="button"
          accessibilityLabel={`Make ${program.program_title} your primary program`}
        >
          <Text style={styles.makePrimaryText}>Make primary</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

function TodaySessionRow({
  session,
  onPress,
}: {
  session: TodaySession;
  onPress: (session: TodaySession) => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={styles.sessionRow}
      onPress={() => onPress(session)}
      accessibilityRole="button"
    >
      <View style={[styles.sessionDot, { backgroundColor: typeBadgeColor(session.program_type) }]} />
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionLabel}>{session.day_label}</Text>
        <Text style={styles.sessionProgram}>{session.program_title}</Text>
      </View>
      <Text style={styles.sessionChevron}>›</Text>
    </TouchableOpacity>
  );
}

type Props = NativeStackScreenProps<ProgramsStackParamList, "ProgramHub">;

export function ProgramHubScreen({ navigation }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const setActiveProgramId = useSessionStore((state) => state.setActiveProgramId);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerDate, setPickerDate] = React.useState("");
  const [pickerSessions, setPickerSessions] = React.useState<SessionsByDateItem[]>([]);

  const activeProgramsQuery = useQuery({
    queryKey: ["activePrograms"],
    queryFn: fetchActivePrograms,
  });

  const combinedCalendarQuery = useQuery({
    queryKey: ["combinedCalendar"],
    queryFn: () => fetchCombinedCalendar(),
  });

  const sessionsByDateMutation = useMutation({
    mutationFn: fetchSessionsByDate,
    onSuccess: (data) => {
      setPickerDate(data.scheduled_date);
      setPickerSessions(data.sessions);
      setPickerOpen(true);
    },
  });

  const makePrimaryMutation = useMutation({
    mutationFn: setPrimaryProgram,
    onSuccess: (_data, programId) => {
      setActiveProgramId(programId);
      void queryClient.invalidateQueries({ queryKey: ["activePrograms"] });
      void queryClient.invalidateQueries({ queryKey: ["combinedCalendar"] });
    },
  });

  React.useEffect(() => {
    const primaryProgramId = activeProgramsQuery.data?.primary_program_id ?? null;
    if (primaryProgramId) {
      setActiveProgramId(primaryProgramId);
    }
  }, [activeProgramsQuery.data?.primary_program_id, setActiveProgramId]);

  function handleOpenProgram(programId: string) {
    setActiveProgramId(programId);
    navigation.navigate("ProgramDashboard", { programId });
  }

  function handleOpenSession(programDayId: string, programId: string) {
    setActiveProgramId(programId);
    navigation.navigate("ProgramDay", { programDayId });
  }

  function handleOpenTodaySession(session: TodaySession) {
    handleOpenSession(session.program_day_id, session.program_id);
  }

  function handleCalendarDayPress(day: CalendarDay) {
    if (day.sessions.length === 1) {
      const session = day.sessions[0];
      handleOpenSession(session.program_day_id, session.program_id);
      return;
    }
    void sessionsByDateMutation.mutate(day.scheduled_date);
  }

  function handleSelectPickerSession(programDayId: string) {
    const matched = pickerSessions.find((session) => session.program_day_id === programDayId);
    if (matched) {
      handleOpenSession(programDayId, matched.program_id);
    }
  }

  if (activeProgramsQuery.isLoading || combinedCalendarQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (activeProgramsQuery.isError || combinedCalendarQuery.isError || !activeProgramsQuery.data || !combinedCalendarQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load programs.</Text>
        <TouchableOpacity
          onPress={() => {
            void activeProgramsQuery.refetch();
            void combinedCalendarQuery.refetch();
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { programs, today_sessions } = activeProgramsQuery.data;

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={programs}
        keyExtractor={(item) => item.program_id}
        ListHeaderComponent={
          <>
            {today_sessions.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Today's Sessions</Text>
                {today_sessions.map((session) => (
                  <TodaySessionRow
                    key={session.program_day_id}
                    session={session}
                    onPress={handleOpenTodaySession}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Combined Calendar</Text>
              <CombinedCalendar
                days={combinedCalendarQuery.data.days}
                onDayPress={handleCalendarDayPress}
              />
            </View>
            <Text style={styles.sectionTitle}>Active Programs</Text>
          </>
        }
        renderItem={({ item }) => (
          <ProgramCard
            program={item}
            onPress={handleOpenProgram}
            onMakePrimary={(programId) => makePrimaryMutation.mutate(programId)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No active programs. Generate one to get started.</Text>
        }
      />
      <SessionPickerSheet
        visible={pickerOpen}
        scheduledDate={pickerDate}
        sessions={pickerSessions}
        onSelectSession={handleSelectPickerSession}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, marginBottom: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryCard: { borderColor: colors.accent },
  cardHeader: { flexDirection: "row", gap: 8, alignItems: "center" },
  typeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  primaryBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.accent },
  primaryBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.textPrimary },
  cardMeta: { fontSize: 13, color: colors.textSecondary },
  makePrimaryBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  makePrimaryText: { color: colors.accent, fontSize: 13 },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sessionDot: { width: 10, height: 10, borderRadius: 5 },
  sessionInfo: { flex: 1 },
  sessionLabel: { fontSize: 15, fontWeight: "500", color: colors.textPrimary },
  sessionProgram: { fontSize: 12, color: colors.textSecondary },
  sessionChevron: { fontSize: 18, color: colors.textSecondary },
  emptyText: { color: colors.textSecondary, textAlign: "center", marginTop: 32 },
  errorText: { color: colors.textSecondary, marginBottom: 12 },
  retryText: { color: colors.accent },
});
