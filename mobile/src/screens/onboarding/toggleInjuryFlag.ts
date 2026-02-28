export function toggleInjuryFlag(current: string[], clicked: string, noneSlug: string): string[] {
  const uniqueCurrent = Array.from(new Set(current.filter(Boolean)));
  const isNone = clicked === noneSlug;

  if (isNone) {
    return [noneSlug];
  }

  const withoutNone = uniqueCurrent.filter((value) => value !== noneSlug);
  const isSelected = withoutNone.includes(clicked);
  const next = isSelected
    ? withoutNone.filter((value) => value !== clicked)
    : [...withoutNone, clicked];

  if (next.length === 0) {
    return [noneSlug];
  }

  return Array.from(new Set(next));
}
