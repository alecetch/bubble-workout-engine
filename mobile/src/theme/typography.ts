export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: "600" as const,
    lineHeight: 36,
  },
  h2: {
    fontSize: 22,
    fontWeight: "600" as const,
    lineHeight: 30,
  },
  h3: {
    fontSize: 18,
    fontWeight: "600" as const,
    lineHeight: 26,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
    lineHeight: 24,
  },
  small: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "500" as const,
    lineHeight: 18,
  },
  display: {
    fontSize: 40,
    fontWeight: "700" as const,
    lineHeight: 48,
  },
  displaySub: {
    fontSize: 20,
    fontWeight: "600" as const,
    lineHeight: 28,
  },
} as const;

export type TypographyScale = typeof typography;
