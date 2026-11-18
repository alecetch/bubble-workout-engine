import { useCallback } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

export function useReviewEditBack(
  enabled: boolean,
  navigation: Pick<NativeStackNavigationProp<OnboardingStackParamList>, "replace">,
  normalBack: () => void,
): () => void {
  const discard = useCallback(() => { navigation.replace("ProgramReview"); }, [navigation]);
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      discard();
      return true;
    });
    return () => subscription.remove();
  }, [enabled, discard]));
  return enabled ? discard : normalBack;
}
