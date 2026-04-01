export const colors = {
  background: "#0F172A",
  surface: "#1E293B",
  card: "#111827",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  accent: "#3B82F6",
  accentHover: "#2563EB",
  accentPressed: "#1D4ED8",
  success: "#22C55E",
  error: "#EF4444",
  warning: "#FACC15",
  border: "rgba(148,163,184,0.15)",
  focus: "#3B82F6",
} as const;

export type AppColors = typeof colors;
