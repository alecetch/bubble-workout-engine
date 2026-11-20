import { pool as requiredDbPool } from "../../db.js";
import { dbAvailableOrSkip } from "../../../test/helpers/requireDb.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeReferralRewardService } from '../referralRewardService.js';
import { closeDb, withUsers } from '../../../testSupport/entitlementFixtures.js';
test.after(closeDb);
const at = Date.parse('2031-01-01T12:00:00Z');
const purchase = id => ({ id: randomUUID(), app_user_id: id.toUpperCase(), environment: 'PRODUCTION', type: 'INITIAL_PURCHASE', period_type: 'NORMAL', event_timestamp_ms: at });

for (const scenario of ['normal', 'trial', 'intro', 'trial conversion', 'later renewal', 'sandbox off', 'sandbox on', 'no referral', 'invalid identity']) {
  test(`conversion: ${scenario}`, async (t) => {
  if (!await dbAvailableOrSkip(t, requiredDbPool)) return;
  return withUsers(async (db, [referrer, referred]) => {
    if (scenario !== 'no referral') await db.query('INSERT INTO referral_conversion (referrer_user_id,referred_user_id,referred_code) VALUES ($1,$2,$3)', [referrer, referred, 'CODE']);
    const service = makeReferralRewardService({ db, env: scenario === 'sandbox on' ? { REFERRAL_REWARDS_ALLOW_SANDBOX: 'true' } : {} });
    const event = purchase(referred);
    if (scenario === 'trial') event.period_type = 'TRIAL';
    if (scenario === 'intro') event.period_type = 'INTRO';
    if (scenario === 'trial conversion' || scenario === 'later renewal') { event.type = 'RENEWAL'; event.is_trial_conversion = scenario === 'trial conversion'; }
    if (scenario.startsWith('sandbox')) event.environment = 'SANDBOX';
    if (scenario === 'invalid identity') event.app_user_id = 'anonymous';
    const qualifies = ['normal', 'trial conversion', 'sandbox on'].includes(scenario);
    assert.deepEqual(await service.recordWebhookEvent(event), { action: qualifies ? 'converted' : 'ignored' });
    const before = (await db.query('SELECT * FROM referral_conversion WHERE referred_user_id = $1', [referred])).rows[0];
    if (qualifies) {
      assert.equal(before.reward_status, 'pending');
      assert.equal(+before.converted_at, at);
      assert.equal(+before.reward_due_at, at + 7 * 86400000);
      assert.equal(+before.reward_next_attempt_at, +before.reward_due_at);
      assert.equal(before.conversion_event_id, event.id);
      assert.deepEqual(await service.recordWebhookEvent(event), { action: 'ignored' });
      assert.deepEqual(await service.recordWebhookEvent({ ...event, type: 'RENEWAL', is_trial_conversion: true, event_timestamp_ms: at + 1000 }), { action: 'ignored' });
      assert.deepEqual((await db.query('SELECT * FROM referral_conversion WHERE referred_user_id = $1', [referred])).rows[0], before);
    } else if (before) assert.equal(before.reward_status, 'none');
  });
});
}

for (const status of ['pending', 'granted']) test(`refund while ${status}`, async (t) => {
  if (!await dbAvailableOrSkip(t, requiredDbPool)) return;
  return withUsers(async (db, [referrer, referred]) => {
  await db.query(`INSERT INTO referral_conversion (referrer_user_id,referred_user_id,referred_code,reward_status,converted_at)
    VALUES ($1,$2,'CODE',$3,now())`, [referrer, referred, status]);
  const service = makeReferralRewardService({ db });
  assert.deepEqual(await service.recordWebhookEvent({ ...purchase(referred), type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }), { action: 'ignored' });
  assert.deepEqual(await service.recordWebhookEvent({ ...purchase(referred), type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }), { action: status === 'pending' ? 'voided' : 'ignored' });
  const row = (await db.query('SELECT * FROM referral_conversion WHERE referred_user_id=$1', [referred])).rows[0];
  assert.equal(row.reward_status, status === 'pending' ? 'void' : 'granted');
  if (status === 'pending') assert.equal(row.reward_last_error, 'referred_user_refunded');
});
});

test('unknown environment and non-exact sandbox flag never record', async () => {
  const service = makeReferralRewardService({ db: { query() { assert.fail('unexpected query'); } }, env: { REFERRAL_REWARDS_ALLOW_SANDBOX: 'TRUE' } });
  for (const environment of [undefined, 'SANDBOX', 'UNKNOWN']) assert.deepEqual(await service.recordWebhookEvent({ ...purchase(randomUUID()), environment }), { action: 'ignored' });
});
