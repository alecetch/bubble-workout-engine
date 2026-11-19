import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db.js';
import { runReferralRewards, startReferralRewardJob, shouldStartReferralRewardJob } from '../referralRewardJob.js';
import { DATABASE_SKIP, closeDb } from '../../../testSupport/entitlementFixtures.js';
test.after(closeDb);
const now = new Date('2026-01-15T12:00:00Z');
const day = 86400000;
const future = new Date(+now + 10 * day).toISOString();
const past = new Date(+now - day).toISOString();
const subscriber = (details = {}, product = 'monthly', expiry = future) => ({ entitlements: { pro: { product_identifier: product, expires_date: expiry } }, subscriptions: { [product]: { expires_date: expiry, period_type: 'normal', ...details } } });
async function fixture(fn) {
  const ids = [];
  const addUser = async () => {
    const id = randomUUID(); ids.push(id);
    await pool.query("INSERT INTO app_user(id,subject_id,email,subscription_status) VALUES ($1::uuid,$1::text,$2,'expired')", [id, `${id}@example.test`]);
    await pool.query('UPDATE app_user SET trial_expires_at=$2, subscription_expires_at=NULL WHERE id=$1', [id, past]);
    return id;
  };
  const referrer = await addUser();
  const addRow = async (status = 'pending', grantedAt = null) => {
    const referred = await addUser();
    return (await pool.query(`INSERT INTO referral_conversion(referrer_user_id,referred_user_id,referred_code,converted_at,reward_status,reward_due_at,reward_next_attempt_at,reward_granted_at)
      VALUES ($1,$2,'JOB', $3,$4,$3,$3,$5) RETURNING *`, [referrer, referred, now, status, grantedAt])).rows[0];
  };
  const row = await addRow();
  const calls = [];
  const logs = [];
  const deps = {
    fetchSubscriber: async () => ({}),
    grantPromotionalEntitlement: async (...args) => { calls.push(['promo', ...args]); return {}; },
    extendAppleSubscription: async (...args) => { calls.push(['apple', ...args]); return {}; },
    deferGoogleSubscription: async (...args) => { calls.push(['google', ...args]); return {}; },
    syncUserEntitlement: async () => { calls.push(['sync']); },
    notificationService: { send: async args => { calls.push(['push', args]); return { sent: true }; } },
  };
  const run = () => runReferralRewards(pool, deps, { now: () => now, log: x => logs.push(x) });
  const read = async () => (await pool.query('SELECT * FROM referral_conversion WHERE id=$1', [row.id])).rows[0];
  try { await fn({ row, referrer, deps, calls, run, read, addRow, logs }); }
  finally { await pool.query('DELETE FROM app_user WHERE id = ANY($1::uuid[])', [ids]); }
}

for (const scenario of ['trial', 'expired', 'existing promo', 'apple', 'google', 'cancelled', 'billing retry']) {
  test(`reward method: ${scenario}`, { skip: DATABASE_SKIP }, () => fixture(async f => {
    let expected = 'promo', expiry = +now + 30 * day;
    if (scenario === 'trial') { await pool.query("UPDATE app_user SET subscription_status='trialing', trial_expires_at=$2 WHERE id=$1", [f.referrer, future]); expiry = Date.parse(future) + 30 * day; }
    if (scenario === 'expired') f.deps.fetchSubscriber = async () => subscriber({}, 'monthly', past);
    if (scenario === 'existing promo') { f.deps.fetchSubscriber = async () => subscriber({ store: 'promotional' }, 'rc_promo_pro'); expiry = Date.parse(future) + 2 * 3600000 + 30 * day; }
    if (scenario === 'apple') { f.deps.fetchSubscriber = async () => subscriber({ store: 'app_store', store_transaction_id: 'transaction-123' }); expected = 'apple'; }
    if (scenario === 'google') { f.deps.fetchSubscriber = async () => subscriber({ store: 'play_store' }, 'monthly:base'); expected = 'google'; }
    if (scenario === 'cancelled') {
      f.deps.fetchSubscriber = async () => subscriber({ store: 'app_store', unsubscribe_detected_at: past });
      await pool.query('UPDATE app_user SET subscription_expires_at=$2 WHERE id=$1', [f.referrer, future]); expiry = Date.parse(future) + 30 * day;
    }
    if (scenario === 'billing retry') f.deps.fetchSubscriber = async () => subscriber({ store: 'app_store', billing_issues_detected_at: past });
    const result = await f.run();
    assert.equal(f.calls[0][0], expected);
    if (expected === 'promo') assert.equal(f.calls[0][3].endTimeMs, expiry);
    if (expected === 'apple') assert.equal(f.calls[0][2], 'transaction-123');
    if (expected === 'google') assert.equal(f.calls[0][2], 'monthly');
    const row = await f.read(); assert.equal(row.reward_status, 'granted'); assert.equal(+row.reward_notified_at, +now);
    assert.deepEqual(f.calls.map(x => x[0]), [expected, 'sync', 'push']);
    assert.equal(f.calls[2][1].transactional, true); assert.deepEqual(f.calls[2][1].data, { type: 'referral_reward' });
    await f.run(); assert.equal(f.calls.length, 3);
    assert.equal(result.failed, 0); assert.equal(f.logs[0].event, 'referral.reward.run');
  }));
}

test('two grants in rolling 12 months cap the third, but older grants do not', { skip: DATABASE_SKIP }, () => fixture(async f => {
  await f.addRow('granted', new Date(+now - day));
  const second = await f.addRow('granted', new Date(+now - 400 * day));
  await pool.query('UPDATE referral_conversion SET reward_granted_at=$2 WHERE id=$1', [second.id, new Date(+now - day)]);
  assert.equal((await f.run()).capped, 1); assert.equal((await f.read()).reward_status, 'capped'); assert.equal(f.calls.length, 0);
  await pool.query("UPDATE referral_conversion SET reward_status='pending' WHERE id=$1", [f.row.id]);
  await pool.query('UPDATE referral_conversion SET reward_granted_at=$2 WHERE id=$1', [second.id, new Date(+now - 400 * day)]);
  assert.equal((await f.run()).granted_promotional, 1);
}));

test('deleted referrer is voided and future due rows wait', { skip: DATABASE_SKIP }, () => fixture(async f => {
  await pool.query('UPDATE referral_conversion SET reward_next_attempt_at=$2 WHERE id=$1', [f.row.id, future]);
  await f.run(); assert.equal(f.calls.length, 0);
  await pool.query('UPDATE referral_conversion SET reward_next_attempt_at=$2 WHERE id=$1', [f.row.id, now]);
  await pool.query('DELETE FROM app_user WHERE id=$1', [f.referrer]);
  assert.equal((await f.run()).voided, 1); assert.equal((await f.read()).reward_last_error, 'referrer_deleted');
}));

for (const kind of ['temporary', 'apple ineligible', 'permanent store', 'permanent promo', 'missing key']) test(`failure: ${kind}`, { skip: DATABASE_SKIP }, () => fixture(async f => {
  const error = (code, detail) => Object.assign(new Error('test'), { code, detail });
  if (kind === 'apple ineligible' || kind === 'permanent store') {
    f.deps.fetchSubscriber = async () => subscriber({ store: 'app_store', store_transaction_id: 'tx' });
    f.deps.extendAppleSubscription = async () => { throw error('revenuecat_permanent', { status: 403, code: kind === 'apple ineligible' ? '4030005' : 'bad_request' }); };
  } else f.deps.grantPromotionalEntitlement = async () => {
    if (kind === 'missing key') return { skipped: true };
    throw error(kind === 'permanent promo' ? 'revenuecat_permanent' : 'revenuecat_temporary');
  };
  const result = await f.run(); const row = await f.read();
  if (kind === 'permanent store') { assert.equal(row.reward_status, 'granted'); assert.equal(row.reward_method, 'promotional_entitlement'); return; }
  if (kind === 'permanent promo') { assert.equal(row.reward_status, 'failed'); assert.equal(result.failed, 1); return; }
  assert.equal(row.reward_status, 'pending'); assert.equal(row.reward_attempts, 1); assert.equal(+row.reward_next_attempt_at, +now + day);
  assert.equal(result.retried, 1);
  // 31 days after due, the next attempt uses promotion rather than the store.
  await pool.query("UPDATE referral_conversion SET reward_due_at=$2, reward_next_attempt_at=$3 WHERE id=$1", [row.id, new Date(+now - 31 * day), now]);
  f.deps.grantPromotionalEntitlement = async () => { f.calls.push(['fallback']); return {}; };
  await f.run(); assert.equal((await f.read()).reward_status, 'granted'); assert.equal(f.calls[0][0], 'fallback');
}));

test('permanent fallback failure is failed', { skip: DATABASE_SKIP }, () => fixture(async f => {
  await pool.query('UPDATE referral_conversion SET reward_attempts=1, reward_due_at=$2 WHERE id=$1', [f.row.id, new Date(+now - 31 * day)]);
  f.deps.grantPromotionalEntitlement = async () => { throw Object.assign(new Error('no'), { code: 'revenuecat_permanent' }); };
  assert.equal((await f.run()).failed, 1); assert.equal((await f.read()).reward_status, 'failed');
}));

test('sync/push failures never regrant and unsuccessful push is not marked notified', { skip: DATABASE_SKIP }, () => fixture(async f => {
  f.deps.syncUserEntitlement = async () => { throw Error('unavailable'); };
  f.deps.notificationService.send = async () => ({ sent: false, reason: 'no_channel' });
  await f.run(); await f.run(); assert.equal(f.calls.length, 1); assert.equal((await f.read()).reward_notified_at, null);
}));

test('concurrent runs over the same row grant once', { skip: DATABASE_SKIP }, () => fixture(async f => {
  let release, entered;
  const waiting = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  f.deps.grantPromotionalEntitlement = async () => { f.calls.push(['promo']); entered(); await waiting; return {}; };
  const first = f.run(); await started;
  try { await f.run(); } finally { release(); }
  await first; assert.equal(f.calls.filter(x => x[0] === 'promo').length, 1);
}));

test('flag is exact and disabled scheduler never connects', () => {
  for (const value of [undefined, 'false', 'TRUE', '1', true]) {
    assert.equal(shouldStartReferralRewardJob({ REFERRAL_REWARDS_ENABLED: value }), false);
    assert.equal(startReferralRewardJob({ db: {}, env: { REFERRAL_REWARDS_ENABLED: value } }), null);
  }
  assert.equal(shouldStartReferralRewardJob({ REFERRAL_REWARDS_ENABLED: 'true' }), true);
});

test('scheduler prevents overlap, stops, unlocks and releases after errors', async t => {
  const queries = []; let connects = 0, releases = 0, entered, release;
  const waiting = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const db = { async connect() { connects++; return { release() { releases++; }, async query(sql) {
    queries.push(sql);
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
    if (sql.startsWith('SELECT *')) { entered(); await waiting; throw Error('db unavailable'); }
    return { rows: [] };
  } }; } };
  const errors = [];
  const job = startReferralRewardJob({ db, env: { REFERRAL_REWARDS_ENABLED: 'true', REFERRAL_REWARDS_INTERVAL_MS: '3600000' }, logger: { error: x => errors.push(x) } });
  t.after(job.stop); assert.equal(job.intervalMs, 3600000);
  const first = job.tick(); await started;
  await job.tick(); assert.equal(connects, 1);
  release(); await first;
  assert.ok(queries.includes('ROLLBACK')); assert.ok(queries.some(q => q.includes('pg_advisory_unlock'))); assert.equal(releases, 1);
  assert.deepEqual(errors, [{ event: 'referral.reward.run_error' }]);
  job.stop(); await job.tick(); assert.equal(connects, 1);
});

test('busy advisory lock never claims rows or unlocks another run', async () => {
  const queries = []; let released = false;
  await runReferralRewards({ connect: async () => ({ query: async sql => { queries.push(sql); return { rows: [{ locked: false }] }; }, release() { released = true; } }) });
  assert.equal(queries.length, 1); assert.equal(released, true);
});

test('void and unconverted referrals never grant', { skip: DATABASE_SKIP }, () => fixture(async f => {
  for (const status of ['none', 'void']) {
    await pool.query('UPDATE referral_conversion SET reward_status=$2 WHERE id=$1', [f.row.id, status]);
    await f.run(); assert.equal(f.calls.length, 0);
  }
}));

test('concurrent due rewards respect cap across different referred users', { skip: DATABASE_SKIP }, () => fixture(async f => {
  await f.addRow('granted', new Date(+now - day)); await f.addRow();
  await Promise.all([f.run(), f.run()]);
  const result = await pool.query("SELECT reward_status,COUNT(*)::int AS count FROM referral_conversion WHERE referrer_user_id=$1 GROUP BY reward_status", [f.referrer]);
  assert.deepEqual(Object.fromEntries(result.rows.map(r => [r.reward_status, r.count])), { granted: 2, capped: 1 });
  assert.equal(f.calls.filter(c => c[0] === 'promo').length, 1);
}));

for (const scenario of ["locked", "busy", "error"]) test(`heartbeat: ${scenario} run`, async t => {
  const heartbeats = [], results = []; let releases = 0;
  const db = { async connect() { return { async query(sql) {
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: scenario !== "busy" }] };
    if (scenario === "error" && sql.startsWith("SELECT *")) throw Error("run failed");
    return { rows: [] };
  }, release() { releases++; } }; }, async query() {
    if (scenario === "error") throw Error("run failed"); return { rows: [] };
  } };
  const heartbeat = async (options, fn) => { heartbeats.push(options); try { const result = await fn(); results.push("ok"); return result; } catch (error) { results.push("error"); throw error; } };
  const job = startReferralRewardJob({ db, env: { REFERRAL_REWARDS_ENABLED: "true" }, heartbeat, intervalMs: 900000 });
  t.after(job.stop); await job.tick();
  assert.equal(heartbeats.length, scenario === "busy" ? 0 : 1);
  assert.deepEqual(results, scenario === "busy" ? [] : [scenario === "error" ? "error" : "ok"]);
  assert.equal(releases, 1);
});
