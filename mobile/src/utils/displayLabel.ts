// Rollout fallback for API responses that do not yet include display labels.
// Keep these maps and formatting rules aligned with api/src/utils/displayLabels.js.
export const programTypeLabels: Record<string, string> = {
  hypertrophy: "Hypertrophy",
  strength: "Strength",
  conditioning: "Conditioning",
  hyrox: "HYROX",
  recovery: "Recovery",
};

export const dayFocusLabels: Record<string, string> = {
  full: "Full Body",
  full_body: "Full Body",
  upper: "Upper Body",
  upper_body: "Upper Body",
  lower: "Lower Body",
  lower_body: "Lower Body",
  engine: "Engine",
  engine_power: "Engine Power",
  mixed_modal: "Mixed Modal",
  aerobic_base: "Aerobic Base",
  endurance: "Endurance",
  power: "Power",
  simulation: "Simulation",
};

export const dayTypeLabels: Record<string, string> = { ...programTypeLabels };
export const displayLabelMaps = { programType: programTypeLabels, dayFocus: dayFocusLabels, dayType: dayTypeLabels };

export function displayLabel(kind: keyof typeof displayLabelMaps, slug: string | null | undefined): string {
  if (slug == null) return "";
  const raw = String(slug).trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[\s_]+/g, "_");
  const labels = displayLabelMaps[kind];
  if (Object.hasOwn(labels, key)) return labels[key];
  return raw.replace(/_/g, " ").replace(/\b\p{L}/gu, letter => letter.toUpperCase());
}
