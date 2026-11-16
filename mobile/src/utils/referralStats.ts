import type { ReferralStats } from '../api/referral';

export function formatReferralStats(stats?: Partial<ReferralStats> | null): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  const { conversions = 0, rewardsGranted = 0, rewardsPending = 0 } = stats;
  if (conversions > 0) parts.push(`${conversions} ${conversions === 1 ? 'friend' : 'friends'} subscribed`);
  if (rewardsGranted > 0) parts.push(`${rewardsGranted} free ${rewardsGranted === 1 ? 'month' : 'months'} earned`);
  if (rewardsPending > 0) parts.push(`${rewardsPending} on ${rewardsPending === 1 ? 'its' : 'their'} way`);
  // All-zero/legacy responses retain the existing invite-link fallback.
  if (stats.rewardsRemainingThisYear === 0 && (parts.length > 0 || (stats.rewardsCapped ?? 0) > 0)) parts.push('Yearly limit reached');
  return parts.length ? parts.join(' · ') : null;
}
