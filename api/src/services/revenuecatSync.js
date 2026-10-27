import { computeEntitlement } from "./entitlement.js";

export const SUBSCRIBER_TIMEOUT_MS = 10_000;
export const ENTITLEMENT_USER_COLUMNS = `subscription_status, trial_expires_at, subscription_expires_at,
  subscription_event_at, physique_consent_at IS NOT NULL AS physique_consent_given`;

function syncError(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function fetchSubscriber(appUserId, {
  fetchImpl = fetch, apiKey = process.env.REVENUECAT_SECRET_API_KEY, timeoutMs = SUBSCRIBER_TIMEOUT_MS,
} = {}) {
  if (!apiKey?.trim()) throw syncError("entitlement_sync_unavailable", "Entitlement sync is not configured.");
  const controller = new AbortController();
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("RevenueCat request timed out."));
      }, timeoutMs);
    });
    return await Promise.race([deadline, (async () => {
      const response = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` }, signal: controller.signal,
      });
      if (!response.ok) throw new Error(`RevenueCat returned ${response.status}.`);
      const body = await response.json();
      if (!body?.subscriber || typeof body.subscriber !== "object" || Array.isArray(body.subscriber)) {
        throw new Error("Invalid RevenueCat subscriber response.");
      }
      return body.subscriber;
    })()]);
  } catch (err) {
    throw syncError("entitlement_sync_failed", err?.message || "RevenueCat sync failed.");
  } finally {
    clearTimeout(timer);
  }
}

export function deriveStatusFromSubscriber(subscriber, now = new Date()) {
  const pro = subscriber?.entitlements?.pro;
  if (!pro) return { subscription_status: "expired", subscription_expires_at: null };
  if (typeof pro !== "object" || Array.isArray(pro)) throw syncError("entitlement_sync_failed", "Invalid RevenueCat entitlement.");
  const subscription = subscriber.subscriptions?.[pro.product_identifier] ?? {};
  const billing = Boolean(subscription.billing_issues_detected_at);
  const expires = (billing && subscription.grace_period_expires_date) || pro.expires_date || null;
  if (expires != null && !Number.isFinite(new Date(expires).getTime())) {
    throw syncError("entitlement_sync_failed", "Invalid RevenueCat expiration date.");
  }
  const expired = expires != null && new Date(expires) <= new Date(now);
  return {
    subscription_status: expired ? "expired" : billing ? "billing_issue"
      : subscription.unsubscribe_detected_at ? "cancelled" : "active",
    subscription_expires_at: expires,
  };
}

export async function syncUserEntitlement(db, userId, {
  fetchSubscriberFn = fetchSubscriber, now = new Date(), eventTimestampMs, ...fetchDeps
} = {}) {
  // Capture the observation time before the network call. A newer webhook must win.
  const timestamp = eventTimestampMs ?? new Date(now).getTime();
  const current = (await db.query(`SELECT ${ENTITLEMENT_USER_COLUMNS} FROM app_user WHERE id = $1`, [userId])).rows[0];
  if (!current) return { row: null, applied: false, reason: "unknown_user" };
  if (current.subscription_event_at != null && new Date(current.subscription_event_at).getTime() >= timestamp) {
    return { ...computeEntitlement(current, now), row: current, applied: false, reason: "stale_event" };
  }
  let subscriber;
  try {
    subscriber = await fetchSubscriberFn(userId, fetchDeps);
  } catch (err) {
    if (err.code === "entitlement_sync_unavailable") throw err;
    throw syncError("entitlement_sync_failed", err?.message || "RevenueCat sync failed.");
  }
  const derived = deriveStatusFromSubscriber(subscriber, now);
  const updated = await db.query(`UPDATE app_user SET
      subscription_status = CASE WHEN subscription_status = 'trialing' AND trial_expires_at >= $5::timestamptz
        AND $2 = 'expired' THEN subscription_status ELSE $2 END,
      subscription_expires_at = CASE WHEN subscription_status = 'trialing' AND trial_expires_at >= $5::timestamptz
        AND $2 = 'expired' THEN subscription_expires_at ELSE $3::timestamptz END,
      subscription_event_at = to_timestamp($4 / 1000.0)
    WHERE id = $1 AND (subscription_event_at IS NULL OR subscription_event_at < to_timestamp($4 / 1000.0))
      AND date_trunc('milliseconds', subscription_event_at) IS NOT DISTINCT FROM date_trunc('milliseconds', $6::timestamptz)
    RETURNING ${ENTITLEMENT_USER_COLUMNS}`,
  [userId, derived.subscription_status, derived.subscription_expires_at, timestamp, now, current.subscription_event_at ?? null]);
  const row = updated.rows[0] ?? (await db.query(`SELECT ${ENTITLEMENT_USER_COLUMNS} FROM app_user WHERE id = $1`, [userId])).rows[0];
  return { ...computeEntitlement(row, now), row: row ?? null, applied: updated.rowCount > 0,
    ...(updated.rowCount ? {} : { reason: row ? "stale_event" : "unknown_user" }) };
}
