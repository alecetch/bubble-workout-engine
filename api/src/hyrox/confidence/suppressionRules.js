import { CONFIDENCE_RULES, GRADE_RANK, MIN_SAMPLES_BY_OUTPUT } from "./confidenceConfig.js";

export function meetsPublicContentThreshold(claimType, grade, sampleSize = 0) {
  const gradeRank = GRADE_RANK[grade] ?? 0;
  let show = false;
  let requiresCaveat = false;

  if (claimType === "broad_population") {
    show = gradeRank >= GRADE_RANK["A"];
  } else if (claimType === "sex_specific") {
    show = gradeRank >= GRADE_RANK["A"] || (gradeRank >= GRADE_RANK["B"] && sampleSize >= 5000);
  } else if (claimType === "age_group" || claimType === "division_specific") {
    show = gradeRank >= GRADE_RANK["B"];
  } else if (claimType === "niche_subgroup") {
    show = gradeRank >= GRADE_RANK["C"];
    requiresCaveat = show;
  } else {
    show = gradeRank >= GRADE_RANK["A"];
  }

  return { show, requiresCaveat };
}

function gradeBelow(grade, minGrade) {
  return (GRADE_RANK[grade] ?? 0) < (GRADE_RANK[minGrade] ?? 0);
}

export function shouldShowInsight(insight = {}, confidence = {}, context = {}) {
  if (confidence.grade === "E") return false;
  const minSample = MIN_SAMPLES_BY_OUTPUT[insight.outputType] ?? 0;
  if ((confidence.sampleSize ?? insight.sampleSize ?? 0) < minSample) return false;
  if (insight.isPredictive && gradeBelow(confidence.grade, "B")) return false;
  if (insight.isPrescriptive && context.daysToRace < 14 && insight.suggestsVolumeIncrease) return false;
  if (Number.isFinite(insight.timePotentialSeconds) && insight.timePotentialSeconds < CONFIDENCE_RULES.timePotentialNoiseFloorSeconds) return false;
  if (context.dataQualityScore !== undefined && context.dataQualityScore < 70) return false;
  return true;
}

export function shouldSoftenInsight(insight = {}, confidence = {}) {
  if (confidence.grade === "C" || confidence.grade === "D") return true;
  if ((confidence.fallbackLevel ?? 0) >= 2) return true;
  if (insight.usesInferredRoxzone && (insight.unallocatedTimeSeconds ?? 0) > 1200) return true;
  if (insight.ageGroupMissing) return true;
  return false;
}
