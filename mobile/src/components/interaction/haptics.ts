import * as Haptics from "expo-haptics";

async function safeImpact(style: Haptics.ImpactFeedbackStyle): Promise<void> {
  try {
    await Haptics.impactAsync(style);
  } catch {
    // No-op on unsupported platforms (e.g., web without haptics support).
  }
}

export async function hapticLight(): Promise<void> {
  await safeImpact(Haptics.ImpactFeedbackStyle.Light);
}

export async function hapticMedium(): Promise<void> {
  await safeImpact(Haptics.ImpactFeedbackStyle.Medium);
}

export async function hapticHeavy(): Promise<void> {
  await safeImpact(Haptics.ImpactFeedbackStyle.Heavy);
}
