export const INJURY_FLAG_OPTIONS = [
  { code: "shoulder_issues", label: "Shoulder Issues" },
  { code: "knee_issues", label: "Knee Issues" },
  { code: "lower_back_spine", label: "Lower Back / Spine" },
  { code: "ankle_foot", label: "Ankle / Foot" },
  { code: "wrist_elbow", label: "Wrist / Elbow" },
  { code: "cardiovascular_limitations", label: "Cardiovascular Limitations" },
  { code: "no_known_issues", label: "No Known Issues" },
];
const codes = new Set(INJURY_FLAG_OPTIONS.map(option => option.code));

export class InvalidInjuryFlagError extends Error {
  constructor() {
    super("Unrecognised injury flag");
    this.name = "InvalidInjuryFlagError";
    this.code = "invalid_injury_flag";
    this.status = 400;
  }
}

export function normalizeInjuryFlag(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return codes.has(code) ? code : null;
}

export function normalizeInjuryFlags(values) {
  if (!Array.isArray(values)) return [];
  const flags = [...new Set(values.map(value => {
    const code = normalizeInjuryFlag(value);
    if (!code) throw new InvalidInjuryFlagError();
    return code;
  }))];
  return flags.length > 1 ? flags.filter(code => code !== "no_known_issues") : flags;
}
