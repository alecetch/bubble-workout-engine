const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeReferralRewardService({ db, log = () => {}, env = process.env }) {
  async function recordWebhookEvent(event) {
    if (!event || (event.environment !== 'PRODUCTION' && !(event.environment === 'SANDBOX' && env.REFERRAL_REWARDS_ALLOW_SANDBOX === 'true'))
      || typeof event.app_user_id !== 'string' || !UUID.test(event.app_user_id)) return { action: 'ignored' };
    const userId = event.app_user_id.toLowerCase();
    let result;
    let action;
    if ((event.type === 'INITIAL_PURCHASE' && event.period_type === 'NORMAL')
      || (event.type === 'RENEWAL' && event.is_trial_conversion === true)) {
      if (!Number.isSafeInteger(event.event_timestamp_ms) || event.event_timestamp_ms < 0 || event.event_timestamp_ms > 8.64e15) return { action: 'ignored' };
      result = await db.query(`UPDATE referral_conversion SET
          converted_at = to_timestamp($2 / 1000.0), conversion_event_id = $3, reward_status = 'pending',
          reward_due_at = to_timestamp($2 / 1000.0) + interval '7 days',
          reward_next_attempt_at = to_timestamp($2 / 1000.0) + interval '7 days'
        WHERE referred_user_id = $1 AND converted_at IS NULL AND reward_status = 'none'`,
      [userId, event.event_timestamp_ms, event.id ?? null]);
      action = 'converted';
    } else if (event.type === 'CANCELLATION' && event.cancel_reason === 'CUSTOMER_SUPPORT') {
      result = await db.query(`UPDATE referral_conversion SET reward_status = 'void', reward_last_error = 'referred_user_refunded'
        WHERE referred_user_id = $1 AND reward_status = 'pending'`, [userId]);
      action = 'voided';
    }
    if (!result?.rowCount) return { action: 'ignored' };
    log({ event: `referral.conversion.${action}` });
    return { action };
  }

  async function getStats(userId) {
    const { rows } = await db.query(`SELECT COUNT(*) AS total_referrals,
        COUNT(*) FILTER (WHERE converted_at IS NOT NULL AND reward_status <> 'void') AS conversions,
        COUNT(*) FILTER (WHERE reward_status = 'granted') AS rewards_granted,
        COUNT(*) FILTER (WHERE reward_status = 'pending') AS rewards_pending,
        COUNT(*) FILTER (WHERE reward_status = 'capped') AS rewards_capped,
        COUNT(*) FILTER (WHERE reward_status = 'granted' AND reward_granted_at > now() - interval '12 months') AS granted_this_year
      FROM referral_conversion WHERE referrer_user_id = $1`, [userId]);
    const row = rows[0] ?? {};
    return { totalReferrals: Number(row.total_referrals ?? 0), conversions: Number(row.conversions ?? 0),
      rewardsGranted: Number(row.rewards_granted ?? 0), rewardsPending: Number(row.rewards_pending ?? 0),
      rewardsCapped: Number(row.rewards_capped ?? 0), rewardCapPerYear: 2,
      rewardsRemainingThisYear: Math.max(0, 2 - Number(row.granted_this_year ?? 0)) };
  }
  return { recordWebhookEvent, getStats };
}
