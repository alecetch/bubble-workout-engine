type GuidelineLoadForFormat = {
  value: number;
  unit: string;
};

export function formatGuidelineValue(guidelineLoad: GuidelineLoadForFormat): string {
  if (guidelineLoad.unit === "bodyweight") return "Bodyweight";
  if (guidelineLoad.unit === "kg_per_hand") return `${guidelineLoad.value} kg / hand`;
  if (guidelineLoad.unit === "kg_per_side") return `${guidelineLoad.value} kg / side`;
  return `${guidelineLoad.value} kg`;
}
