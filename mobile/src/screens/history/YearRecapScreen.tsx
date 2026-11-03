import React, { useCallback } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import type { HistoryStackParamList } from "../../navigation/HistoryStackNavigator";
import { useYearRecap } from "../../api/hooks/yearRecapHooks";
import { YearHeatmap } from "../../components/history/YearHeatmap";
import { useShareCard } from "../../components/share/useShareCard";
import { PressableScale } from "../../components/interaction/PressableScale";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radii } from "../../theme/components";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type Props = NativeStackScreenProps<HistoryStackParamList, "YearRecap">;
export function YearRecapScreen({ route, navigation }: Props): React.JSX.Element {
  const query = useYearRecap(route.params.year);
  const client = useQueryClient();
  const sharing = useShareCard();
  useFocusEffect(useCallback(() => { void client.invalidateQueries({ queryKey: ["yearRecap"] }); }, [client]));
  const recap = query.data?.year === route.params.year ? query.data : undefined;
  const back = <PressableScale style={styles.button} disabled={sharing.isSharing} onPress={() => navigation.goBack()}><Text style={styles.body}>Back to History</Text></PressableScale>;
  if (query.isLoading) return <View style={styles.centered}>{back}<ActivityIndicator /><Text style={styles.body}>Loading your recap...</Text></View>;
  if (query.isError || !recap) return <View style={styles.centered}>{back}
    <Text style={styles.title}>Unable to load your recap</Text><Text style={styles.body}>{query.error?.message ?? "Please try again."}</Text>
    <PressableScale style={styles.button} onPress={() => void query.refetch()}><Text style={styles.body}>Retry</Text></PressableScale>
  </View>;
  return <View style={styles.root}>{sharing.shareView}<ScrollView contentContainerStyle={styles.content}>
    {back}
    <View style={styles.panel}><Text style={styles.title}>{recap.year}. {recap.count} training days.</Text>
      <YearHeatmap year={recap.year} trainingDates={recap.training_dates} todayLocal={recap.today_local}
        windowStart={recap.pro_rated ? recap.window_start : undefined} />
    </View>
    <View style={styles.panel}>
      {recap.best_club ? <Text style={styles.title}>Club {recap.best_club}.</Text> : null}
      {recap.count < recap.target ? <Text style={styles.title}>{recap.count} training days. That's {recap.count} more than zero.</Text>
        : <Text style={styles.body}>Your {recap.target}-day target is in.</Text>}
    </View>
    <View style={styles.panel}>
      <Text style={styles.title}>{recap.best_month ? `${months[recap.best_month.month - 1]} was your best month. ${recap.best_month.count} training days.` : "Your next best month is ahead."}</Text>
      <Text style={styles.body}>{recap.busiest_weekday ? `${recap.busiest_weekday} was your busiest training day.` : "Day 1 can be any day."}</Text>
      <Text style={styles.title}>{recap.longest_on_pace_weeks} {recap.longest_on_pace_weeks === 1 ? "week" : "weeks"} on pace in a row</Text>
    </View>
    <View style={styles.panel}><Text style={styles.title}>{recap.sessions_count} sessions.</Text>
      <Text style={styles.title}>{recap.personal_records_count} personal records.</Text>
    </View>
    <View style={styles.panel}><Text style={styles.title}>{recap.year + 1} starts 1 January. Day 1 is yours.</Text>
      <PressableScale style={styles.button} disabled={sharing.isSharing} onPress={() => void sharing.shareCard({ type: "year", year: recap.year,
        count: recap.count, trainingDates: recap.training_dates, todayLocal: recap.today_local, windowStart: recap.pro_rated ? recap.window_start : undefined })}>
        <Text style={styles.body}>{sharing.isSharing ? "Sharing..." : "Share your year"}</Text>
      </PressableScale>
    </View>
  </ScrollView></View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  panel: { backgroundColor: colors.surface, borderRadius: radii.card, padding: spacing.lg, gap: spacing.lg, minHeight: 220, justifyContent: "center" },
  centered: { flex: 1, padding: spacing.lg, gap: spacing.lg, justifyContent: "center", backgroundColor: colors.background },
  title: { ...typography.h1, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textPrimary },
  button: { minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: colors.accent, borderRadius: radii.pill, justifyContent: "center", alignItems: "center" },
});
