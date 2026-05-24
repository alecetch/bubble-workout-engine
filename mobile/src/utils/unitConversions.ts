export function feetInchesToCm(feet: number | null, inches: number | null): number | null {
  if (feet == null && inches == null) return null;
  const cm = ((feet ?? 0) * 30.48) + ((inches ?? 0) * 2.54);
  return cm > 0 ? Math.round(cm) : null;
}

export function cmToFeetInches(cm: number | null): { feet: number; inches: number } | null {
  if (cm == null || cm <= 0) return null;
  const totalInches = cm / 2.54;
  return { feet: Math.floor(totalInches / 12), inches: Math.round(totalInches % 12) };
}

export function lbsToKg(lbs: number | null): number | null {
  if (lbs == null) return null;
  const kg = lbs / 2.20462;
  return kg > 0 ? Number(kg.toFixed(1)) : null;
}

export function kgToLbs(kg: number | null): number | null {
  if (kg == null) return null;
  return Math.round(kg * 2.20462) || null;
}
