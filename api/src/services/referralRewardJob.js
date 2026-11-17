import { fetchSubscriber, grantPromotionalEntitlement, extendAppleSubscription, deferGoogleSubscription, syncUserEntitlement } from './revenuecatSync.js';
import { makeNotificationService } from './notificationService.js';
import { getBrand } from '../config/brand.js';

const DAY = 86_400_000;
const LOCK = "hashtext('referral-rewards')::bigint";
const millis = value => Number.isFinite(new Date(value ?? NaN).getTime()) ? new Date(value).getTime() : 0;
const temporaryError = code => Object.assign(new Error(code), { code: 'revenuecat_temporary' });

function appleTemporarilyIneligible(err) {
  if (!(err.detail?.status >= 400 && err.detail.status < 500)) return false;
  // Apple codes 4030004 (subscription state) and 4030005 (annual limit):
  // https://developer.apple.com/documentation/appstoreserverapi/subscriptionextensionineligibleerror
  // https://developer.apple.com/documentation/appstoreserverapi/subscriptionmaxextensionerror
  // RC describes trial/billing retry restrictions at:
  // https://www.revenuecat.com/docs/guides/promotional-subscription-extensions
  const detail = `${err.detail.code ?? ''} ${err.detail.message ?? ''}`;
  return /403000[45]|SubscriptionExtensionIneligible|SubscriptionMaxExtension|free offer|offer period|billing retry|maximum extension|yearly.*limit/i.test(detail);
}

function chooseMethod(subscriber, instant) {
  const pro = subscriber?.entitlements?.pro;
  const sub = subscriber?.subscriptions?.[pro?.product_identifier];
  const paid = pro && sub && millis(pro.expires_date) > instant.getTime()
    && millis(sub.expires_date ?? pro.expires_date) > instant.getTime()
    && !sub.unsubscribe_detected_at && !sub.billing_issues_detected_at
    && !sub.refunded_at && !['trial', 'intro'].includes(String(sub.period_type).toLowerCase());
  if (paid && sub.store === 'app_store') {
    // v1 Customer Info exposes store_transaction_id; the extend endpoint accepts
    // either the original or renewal transaction ID (not the product identifier).
    // https://www.revenuecat.com/docs/api-v1/customer-info-model
    // https://www.revenuecat.com/docs/api-v1/transactions#app-store-extend-a-subscription
    if (!sub.store_transaction_id) throw temporaryError('missing_store_transaction_id');
    return { method: 'apple_extension', id: String(sub.store_transaction_id) };
  }
  if (paid && sub.store === 'play_store') return { method: 'google_deferral', id: pro.product_identifier.split(':')[0] };
  return { method: 'promotional_entitlement' };
}

export function shouldStartReferralRewardJob(env = process.env) {
  return env.REFERRAL_REWARDS_ENABLED === 'true';
}

export async function runReferralRewards(db, deps = {}, { now = () => new Date(), log = () => {} } = {}) {
  const started = Date.now();
  const counts = { granted_promotional: 0, granted_apple: 0, granted_google: 0, capped: 0, voided: 0, retried: 0, failed: 0 };
  const instant = new Date(typeof now === 'function' ? now() : now);
  const getSubscriber = deps.fetchSubscriber ?? fetchSubscriber;
  const promote = deps.grantPromotionalEntitlement ?? grantPromotionalEntitlement;
  const extend = deps.extendAppleSubscription ?? extendAppleSubscription;
  const defer = deps.deferGoogleSubscription ?? deferGoogleSubscription;
  const sync = deps.syncUserEntitlement ?? syncUserEntitlement;
  const notifications = deps.notificationService ?? makeNotificationService(db);
  let client;
  let locked = false;
  try {
    // The same lock protects direct runs and scheduled runs, including cap checks
    // across distinct referrals belonging to the same referrer.
    client = await db.connect();
    locked = (await client.query(`SELECT pg_try_advisory_lock(${LOCK}) AS locked`)).rows[0]?.locked === true;
    if (!locked) return counts;
    for (let index = 0; index < 50; index++) {
      let row;
      let granted = false;
      await client.query('BEGIN');
      try {
        row = (await client.query(`SELECT * FROM referral_conversion
          WHERE reward_status = 'pending' AND reward_next_attempt_at <= $1
          ORDER BY reward_due_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`, [instant])).rows[0];
        if (!row) { await client.query('COMMIT'); break; }
        const user = row.referrer_user_id && (await client.query(`SELECT id, subscription_status, trial_expires_at, subscription_expires_at
          FROM app_user WHERE id = $1 FOR UPDATE`, [row.referrer_user_id])).rows[0];
        if (!user) {
          await client.query("UPDATE referral_conversion SET reward_status = 'void', reward_last_error = 'referrer_deleted' WHERE id = $1", [row.id]);
          counts.voided++;
        } else {
          const cap = await client.query(`SELECT COUNT(*) AS count FROM referral_conversion
            WHERE referrer_user_id = $1 AND reward_status = 'granted' AND reward_granted_at > $2::timestamptz - interval '12 months'`, [user.id, instant]);
          if (Number(cap.rows[0].count) >= 2) {
            await client.query("UPDATE referral_conversion SET reward_status = 'capped' WHERE id = $1", [row.id]);
            counts.capped++;
          } else {
            let method;
            try {
              const subscriber = await getSubscriber(user.id);
              const promoEnd = () => Math.max(instant.getTime(), millis(user.trial_expires_at), millis(user.subscription_expires_at),
                subscriber?.entitlements?.pro?.product_identifier?.startsWith('rc_promo')
                  ? millis(subscriber.entitlements.pro.expires_date) + 2 * 3_600_000 : 0) + 30 * DAY;
              const promo = async () => {
                method = 'promotional_entitlement';
                return promote(user.id, 'pro', { endTimeMs: promoEnd() });
              };
              let result;
              // Wait 30 days after a failed store attempt before the D5 fallback.
              if (row.reward_attempts > 0 && instant - new Date(row.reward_due_at) > 30 * DAY) result = await promo();
              else {
                const choice = chooseMethod(subscriber, instant);
                method = choice.method;
                try {
                  result = method === 'apple_extension' ? await extend(user.id, choice.id, { days: 30, reasonCode: 1 })
                    : method === 'google_deferral' ? await defer(user.id, choice.id, { days: 30 }) : await promo();
                } catch (err) {
                  if (method === 'apple_extension' && appleTemporarilyIneligible(err)) throw temporaryError('apple_temporarily_ineligible');
                  if (err.code !== 'revenuecat_permanent' || method === 'promotional_entitlement') throw err;
                  result = await promo();
                }
              }
              if (result?.skipped) throw temporaryError('reward_api_unconfigured');
              await client.query(`UPDATE referral_conversion SET reward_status = 'granted', reward_granted_at = $2,
                reward_method = $3, reward_attempts = reward_attempts + 1, reward_last_error = NULL,
                reward_next_attempt_at = NULL WHERE id = $1`, [row.id, instant, method]);
              granted = true;
              counts[method === 'apple_extension' ? 'granted_apple' : method === 'google_deferral' ? 'granted_google' : 'granted_promotional']++;
            } catch (err) {
              const failed = err.code === 'revenuecat_permanent';
              const errorCode = failed ? 'revenuecat_permanent' : 'revenuecat_temporary';
              await client.query(`UPDATE referral_conversion SET reward_status = $2, reward_attempts = reward_attempts + 1,
                reward_next_attempt_at = $3::timestamptz + interval '24 hours', reward_last_error = $4 WHERE id = $1`,
              [row.id, failed ? 'failed' : 'pending', instant, errorCode]);
              counts[failed ? 'failed' : 'retried']++;
              if (failed) log({ event: 'referral.reward.failed', referral_id: row.id, code: errorCode });
            }
          }
        }
        await client.query('COMMIT');
      } catch (err) { await client.query('ROLLBACK'); throw err; }
      if (granted) {
        // Persist the grant before best-effort follow-ups: a sync/push failure
        // must never cause another store extension on the next run.
        try { await sync(db, row.referrer_user_id, { now: instant }); }
        catch { log({ event: 'referral.reward.sync_failed', referral_id: row.id }); }
        try {
          const sent = await notifications.send({ userId: row.referrer_user_id, title: "You've earned a free month",
            body: `A friend subscribed to ${getBrand().name}, so you've got a free month.`, data: { type: 'referral_reward' }, transactional: true });
          if (sent?.sent === true) await client.query('UPDATE referral_conversion SET reward_notified_at = $2 WHERE id = $1', [row.id, instant]);
        } catch { log({ event: 'referral.reward.notification_failed', referral_id: row.id }); }
      }
    }
    return counts;
  } finally {
    try { if (locked) await client.query(`SELECT pg_advisory_unlock(${LOCK})`).catch(() => {}); }
    finally { client?.release(); }
    log({ event: 'referral.reward.run', ...counts, duration_ms: Date.now() - started });
  }
}

export function startReferralRewardJob({ db, logger, env = process.env,
  intervalMs = Number(env.REFERRAL_REWARDS_INTERVAL_MS) || 900000, now = () => new Date(), deps = {} }) {
  if (!shouldStartReferralRewardJob(env)) return null;
  let running = false;
  let stopped = false;
  async function tick() {
    if (running || stopped) return;
    running = true;
    try { await runReferralRewards(db, deps, { now, log: entry => logger?.info?.(entry) }); }
    catch { logger?.error?.({ event: 'referral.reward.run_error' }); }
    finally { running = false; }
  }
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return { stop() { stopped = true; clearInterval(timer); }, tick, intervalMs };
}
