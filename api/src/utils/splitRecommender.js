export const VALID_FOCUS_SLUGS = new Set([
  "full_body",
  "upper_body",
  "lower_body",
  "push",
  "pull",
  "legs",
]);

export function defaultSplitForProgram(programType, daysPerWeek) {
  const count = Math.max(1, Math.min(7, Number.parseInt(String(daysPerWeek), 10) || 3));
  const isStrength = String(programType || "").trim().toLowerCase() === "strength";

  switch (count) {
    case 1:
    case 2:
      return Array(count).fill("full_body");
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
      return Array.from({ length: count }, (_, i) =>
        i === count - 1 ? "full_body" : i % 2 === 0 ? "upper_body" : "lower_body",
      );
  }
}
