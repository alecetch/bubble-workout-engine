import { expect, it, vi } from 'vitest';
import { authGetJson } from './client';
import { fetchReferralStats } from './referral';
vi.mock('./client', () => ({ authGetJson: vi.fn() }));

it('defaults additive stats from an older API response', async () => {
  vi.mocked(authGetJson).mockResolvedValue({ totalReferrals: 1, conversions: 0, rewardsGranted: 0 });
  expect(await fetchReferralStats()).toEqual({ totalReferrals: 1, conversions: 0, rewardsGranted: 0,
    rewardsPending: 0, rewardsCapped: 0, rewardCapPerYear: 2, rewardsRemainingThisYear: 0 });
});
