import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Step = "goals" | "equipment" | "baselineLoads" | "schedule" | "bodyMetrics";
type Destination = "ProgramReview" | "Step2Equipment" | "Step2bBaselineLoads" | "YearGoal" | "Step4BodyMetrics" | "SplitReview";
type NextRoute = { [Name in Destination]: {
  name: Name; params: OnboardingStackParamList[Name]; method: "replace" | "navigate";
} }[Destination];

export function nextRouteAfterSave(step: Step, options: {
  returnToReview?: boolean;
  fitnessLevel?: string | null;
  equipmentChanged?: boolean;
  dayCountChanged?: boolean;
  daysPerWeek?: number;
} = {}): NextRoute {
  const nonBeginner = ["intermediate", "advanced", "elite"].includes(options.fitnessLevel?.toLowerCase() ?? "");
  if (options.returnToReview) {
    if (step === "equipment" && nonBeginner && options.equipmentChanged) {
      return { name: "Step2bBaselineLoads", params: { returnToReview: true }, method: "replace" };
    }
    if (step === "schedule" && options.dayCountChanged) {
      return { name: "SplitReview", params: { daysPerWeek: options.daysPerWeek }, method: "navigate" };
    }
    return { name: "ProgramReview", params: { preserveDraft: true }, method: "replace" };
  }
  switch (step) {
    case "goals": return { name: "Step2Equipment", params: undefined, method: "replace" };
    case "equipment": return { name: nonBeginner ? "Step2bBaselineLoads" : "YearGoal", params: undefined, method: "replace" };
    case "baselineLoads": return { name: "YearGoal", params: undefined, method: "replace" };
    case "schedule": return { name: "Step4BodyMetrics", params: undefined, method: "navigate" };
    case "bodyMetrics": return { name: "SplitReview", params: { daysPerWeek: options.daysPerWeek || undefined }, method: "navigate" };
  }
}

export function followSavedRoute(navigation: Pick<NativeStackNavigationProp<OnboardingStackParamList>, "replace" | "navigate">, route: NextRoute): void {
  switch (route.name) {
    case "ProgramReview": navigation.replace(route.name, route.params); break;
    case "Step2Equipment": navigation.replace(route.name); break;
    case "Step2bBaselineLoads":
      if (route.params) navigation.replace(route.name, route.params);
      else navigation.replace(route.name);
      break;
    case "YearGoal": navigation.replace(route.name); break;
    case "Step4BodyMetrics": navigation.navigate(route.name); break;
    case "SplitReview": navigation.navigate(route.name, route.params); break;
  }
}
