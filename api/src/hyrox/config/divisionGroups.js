export const INDIVIDUAL_ANALYSIS_DIVISIONS = Object.freeze([
  "open",
  "pro",
  "doubles",
  "doubles_male",
  "doubles_female",
  "doubles_mixed",
  "pro_doubles_male",
  "pro_doubles_female",
  "pro_doubles_mixed",
]);

export const ENRICHED_DOUBLES_DIVISIONS = Object.freeze([
  "doubles_male",
  "doubles_female",
  "doubles_mixed",
  "pro_doubles_male",
  "pro_doubles_female",
  "pro_doubles_mixed",
]);

const DIVISION_ALIASES = Object.freeze({
  mixed: "doubles_mixed",
  mixed_doubles: "doubles_mixed",
});

export function normaliseAnalysisDivision(division) {
  const key = String(division ?? "").trim().toLowerCase();
  if (!key) return null;
  return DIVISION_ALIASES[key] ?? key;
}

export function isIndividualAnalysisDivision(division) {
  const key = normaliseAnalysisDivision(division);
  return Boolean(key && INDIVIDUAL_ANALYSIS_DIVISIONS.includes(key));
}

export function isDoublesAnalysisDivision(division) {
  const key = normaliseAnalysisDivision(division);
  return Boolean(key && (key === "doubles" || key === "pro_doubles" || ENRICHED_DOUBLES_DIVISIONS.includes(key)));
}
