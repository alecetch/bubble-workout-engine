/**
 * Returns the engine's recommended day-focus array for a given program type
 * and days-per-week count. Index 0 = first training day slot.
 *
 * Valid focus slugs: full_body | upper_body | lower_body | push | pull | legs
 * push/pull/legs are only returned for hypertrophy programs with >= 5 days.
 *
 * @param {string} programType   "hypertrophy" | "strength" (any other value → hypertrophy defaults)
 * @param {number} daysPerWeek   Integer 1–7
 * @returns {string[]}
 */
export function defaultSplitForProgram(programType, daysPerWeek) {
  const isStrength = programType === "strength";

  switch (daysPerWeek) {
    case 1:
    case 2:
      return Array(daysPerWeek).fill("full_body");
    case 3:
      return ["full_body", "full_body", "full_body"];
    case 4:
      return ["upper_body", "lower_body", "upper_body", "lower_body"];
    case 5:
      return isStrength
        ? ["upper_body", "lower_body", "upper_body", "lower_body", "full_body"]
        : ["push", "pull", "legs", "upper_body", "lower_body"];
    case 6:
      return isStrength
        ? ["upper_body", "lower_body", "upper_body", "lower_body", "upper_body", "lower_body"]
        : ["push", "pull", "legs", "push", "pull", "legs"];
    default:
      // 7+ days: cycle upper/lower with a full-body finisher
      return Array.from({ length: daysPerWeek }, (_, i) =>
        i === daysPerWeek - 1 ? "full_body" : i % 2 === 0 ? "upper_body" : "lower_body",
      );
  }
}

export const VALID_FOCUS_SLUGS = new Set([
  "full_body", "upper_body", "lower_body", "push", "pull", "legs",
]);
