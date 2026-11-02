import React from "react";
import { StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { firstYearTarget } from "../../utils/yearTarget";
import { toLocalIsoDate } from "../../utils/localDate";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<OnboardingStackParamList, "YearGoal">;

export function YearGoalScreen({ navigation }: Props): React.JSX.Element {
  const { year, target, proRated } = firstYearTarget(toLocalIsoDate());
  return (
    <OnboardingScaffold
      step={3}
      title="The goal: 200 training days this year."
      subtitle="That's about 4 a week, with room for life. Miss a week? Make it up later. It's a year, not a streak."
      errorBannerVisible={false}
      onBack={() => navigation.replace("Step2Equipment")}
      onNext={() => navigation.replace("Step3Schedule")}
      nextLabel="Let's go"
      nextTestID="year-goal-continue"
      nextDisabled={false}
      isSaving={false}
    >
      <Text style={styles.clubs}>Then Club 250. Then Club 300.</Text>
      {proRated ? <Text style={styles.note}>{`You're starting partway through ${year}, so this year's target is ${target}. Next year it's 200.`}</Text> : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  clubs: { ...typography.small, color: colors.textSecondary },
  note: { ...typography.body, color: colors.textPrimary },
});
