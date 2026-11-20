import { suggestedLoad, type WeightUnit } from "../../utils/trainingWeight";
type GuidelineLoadForFormat = {
  value: number;
  unit: string;
};

export function formatGuidelineValue(guidelineLoad: GuidelineLoadForFormat, unit: WeightUnit = "kg"): string {
  if (guidelineLoad.unit === "bodyweight") return "Bodyweight";
  return suggestedLoad(guidelineLoad.value, unit, guidelineLoad.unit === "kg_per_hand" ? "per_hand" : guidelineLoad.unit === "kg_per_side" ? "per_side" : "total").text;
}
