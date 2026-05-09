export function streakCopy(streakDays: number): string {
  if (streakDays === 0) return "Start your streak today.";
  if (streakDays === 1) return "1 session down. Keep it going.";
  if (streakDays < 5) return `${streakDays} sessions in a row. Good momentum.`;
  if (streakDays < 10) return `${streakDays} sessions strong. Don't stop now.`;
  if (streakDays < 20) return `${streakDays} sessions. You're building something real.`;
  return `${streakDays} sessions. Elite consistency.`;
}
