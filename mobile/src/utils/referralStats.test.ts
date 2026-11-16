import { describe, expect, it } from 'vitest';
import { formatReferralStats } from './referralStats';

describe('formatReferralStats', () => {
  it('preserves the invite fallback for absent and all-zero stats', () => {
    expect(formatReferralStats()).toBeNull();
    expect(formatReferralStats({ totalReferrals: 0, conversions: 0, rewardsGranted: 0, rewardsPending: 0, rewardsRemainingThisYear: 0 })).toBeNull();
  });
  it('shows a subscribed friend and earned free month', () => {
    expect(formatReferralStats({ conversions: 1, rewardsGranted: 1, rewardsRemainingThisYear: 1 })).toBe('1 friend subscribed · 1 free month earned');
  });
  it('shows pending rewards', () => expect(formatReferralStats({ conversions: 1, rewardsPending: 1 })).toBe('1 friend subscribed · 1 on its way'));
  it('shows the cap', () => expect(formatReferralStats({ conversions: 3, rewardsGranted: 2, rewardsCapped: 1, rewardsRemainingThisYear: 0 })).toBe('3 friends subscribed · 2 free months earned · Yearly limit reached'));
  it('pluralizes counts', () => expect(formatReferralStats({ conversions: 4, rewardsGranted: 2, rewardsPending: 2 })).toBe('4 friends subscribed · 2 free months earned · 2 on their way'));
});
