export type WeightUnit = "kg" | "lbs";
export const LB_PER_KG = 2.20462262;
export function unitLabel(unit: WeightUnit): "kg" | "lb" { return unit === "lbs" ? "lb" : "kg"; }
export function inputToKg(input: string, unit: WeightUnit): number | null {
  const text = input.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return Number((unit === "lbs" ? value / LB_PER_KG : value).toFixed(2));
}
export function kgToInput(kg: number | null, unit: WeightUnit): string {
  if (kg == null || !Number.isFinite(kg)) return "";
  return unit === "lbs" ? String(Number((kg * LB_PER_KG).toFixed(1))) : String(kg);
}
export function formatWeight(kg: number | null, unit: WeightUnit, opts: { decimals?: 0 | 1 } = {}): string {
  if (kg == null || !Number.isFinite(kg)) return "\u2013";
  const value = unit === "lbs" ? kg * LB_PER_KG : kg;
  const text = opts.decimals == null ? (unit === "kg" ? String(kg) : String(Number(value.toFixed(1))))
    : unit === "kg" ? value.toFixed(opts.decimals) : String(Number(value.toFixed(opts.decimals)));
  return `${text} ${unitLabel(unit)}`;
}
export function formatVolume(kg: number, unit: WeightUnit): string {
  return `${Math.round(unit === "lbs" ? kg * LB_PER_KG : kg).toLocaleString("en-US")} ${unitLabel(unit)}`;
}
export function suggestedLoad(kg: number, unit: WeightUnit, kind: "total" | "per_hand" | "per_side" = "total"): { value: number; text: string } {
  const pounds = kg * LB_PER_KG;
  const step = pounds < 10 ? 1 : kind === "total" ? 5 : 2.5;
  const value = unit === "kg" ? kg : Number((Math.round(pounds / step) * step).toFixed(1));
  return { value, text: `${value} ${unitLabel(unit)}${kind === "per_hand" ? " / hand" : kind === "per_side" ? " / side" : ""}` };
}
