export const STALE_ACTIVE_GRACE_MS = 72 * 60 * 60 * 1000;

export function computeEntitlement(row, now = new Date()) {
  const stored = row?.subscription_status;
  const time = new Date(now).getTime();
  const trialEnd = row?.trial_expires_at == null ? NaN : new Date(row.trial_expires_at).getTime();
  const paidEnd = row?.subscription_expires_at == null ? NaN : new Date(row.subscription_expires_at).getTime();
  let isEntitled = false;
  if (stored === "trialing") isEntitled = trialEnd >= time;
  if (stored === "active") isEntitled = !Number.isFinite(paidEnd) || paidEnd >= time - STALE_ACTIVE_GRACE_MS;
  if (stored === "cancelled" || stored === "billing_issue") isEntitled = paidEnd > time;
  return {
    status: isEntitled ? stored : "expired",
    isEntitled,
    isPaid: stored === "active" || ((stored === "cancelled" || stored === "billing_issue") && isEntitled),
    willRenew: stored === "trialing" ? null : stored === "active" || stored === "billing_issue",
    billingIssue: stored === "billing_issue",
  };
}
