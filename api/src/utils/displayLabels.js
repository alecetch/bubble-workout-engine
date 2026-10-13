export const programTypeLabels = {
  hypertrophy: "Hypertrophy",
  strength: "Strength",
  conditioning: "Conditioning",
  hyrox: "HYROX",
  recovery: "Recovery",
};

export const dayFocusLabels = {
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

export const dayTypeLabels = { ...programTypeLabels };
export const displayLabelMaps = { programType: programTypeLabels, dayFocus: dayFocusLabels, dayType: dayTypeLabels };

export function displayLabel(kind, slug) {
  if (slug == null) return "";
  const raw = String(slug).trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[\s_]+/g, "_");
  const labels = displayLabelMaps[kind];
  if (labels && Object.hasOwn(labels, key)) return labels[key];
  return raw.replace(/_/g, " ").replace(/\b\p{L}/gu, letter => letter.toUpperCase());
}
