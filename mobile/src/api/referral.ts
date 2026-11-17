import { authGetJson } from "./client";

export type ReferralInfo = {
  code: string;
  shareUrl: string;
};

export type ReferralStats = {
  totalReferrals: number;
  conversions: number;
  rewardsGranted: number;
  rewardsPending: number;
  rewardsCapped: number;
  rewardCapPerYear: number;
  rewardsRemainingThisYear: number;
};

export async function fetchReferralInfo(): Promise<ReferralInfo> {
  const raw = await authGetJson<{ ok: boolean; code: string; shareUrl: string }>(
    "/api/users/me/referral-code",
  );
  return {
    code: raw.code ?? "",
    shareUrl: raw.shareUrl ?? "",
  };
}

export async function fetchReferralStats(): Promise<ReferralStats> {
  const raw = await authGetJson<{ ok: boolean } & Partial<ReferralStats>>(
    "/api/users/me/referral-stats",
  );
  return {
    totalReferrals: raw.totalReferrals ?? 0,
    conversions: raw.conversions ?? 0,
    rewardsGranted: raw.rewardsGranted ?? 0,
    rewardsPending: raw.rewardsPending ?? 0,
    rewardsCapped: raw.rewardsCapped ?? 0,
    rewardCapPerYear: raw.rewardCapPerYear ?? 2,
    rewardsRemainingThisYear: raw.rewardsRemainingThisYear ?? 0,
  };
}
