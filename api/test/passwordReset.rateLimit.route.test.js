import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { pool, skip, log, withAuthUser } from '../testSupport/authHardeningFixtures.js';
import { PgRateLimitStore } from '../src/middleware/pgRateLimitStore.js';
process.env.JWT_SECRET ??= 'reset-limit-test-secret-at-least-32-characters';
const { createPasswordResetLimiters, createForgotPasswordHandler, createResetPasswordHandler } = await import('../src/routes/auth.js');
test.after(() => pool.end());
const limited = { ok: false, code: 'rate_limited', error: 'Too many attempts. Try again later.' };

async function fixture(fn) {
  return withAuthUser(async user => {
    const queue = [], emails = [], ips = new Set();
    const schedule = fn => queue.push(fn);
    const drain = async () => { while (queue.length) await queue.shift()(); };
    const { forgotLimiter, resetCodeLimiter } = createPasswordResetLimiters({ storeFactory: options => new PgRateLimitStore({ db: pool, ...options }) });
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use((req, _res, next) => { req.log = log; next(); });
    app.post('/forgot-password', forgotLimiter, createForgotPasswordHandler({ db: pool, schedule, sendReset: async args => emails.push(args) }));
    app.post('/reset-password', resetCodeLimiter, createResetPasswordHandler({ db: pool, schedule, sendChanged: async () => {} }));
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const request = async (path, ip, body = {}) => {
      ips.add(ip);
      const res = await fetch(`http://127.0.0.1:${server.address().port}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ email: user.email, code: '000000', new_password: 'New-password-123', ...body }),
      });
      return { status: res.status, body: await res.json() };
    };
    try { await fn({ ...user, request, emails, drain }); }
    finally {
      await drain();
      await new Promise(resolve => server.close(resolve));
      const keys = [...ips].flatMap(ip => [`auth:forgot:ip:${ip}`, `auth:reset-code:ip:${ip}`]);
      await pool.query('DELETE FROM rate_limit_hit WHERE key=ANY($1::text[])', [keys]);
    }
  });
}

test('ten forgot requests do not consume reset-code IP allowance', { skip }, () => fixture(async f => {
  const ip = '192.0.2.101';
  for (let i=0; i<10; i++) assert.equal((await f.request('forgot-password', ip)).status, 200);
  const reset = await f.request('reset-password', ip);
  assert.equal(reset.status, 400); assert.equal(reset.body.code, 'invalid_code');
  const rows = (await pool.query('SELECT key,hits FROM rate_limit_hit WHERE key=ANY($1::text[])', [[`auth:forgot:ip:${ip}`, `auth:reset-code:ip:${ip}`]])).rows;
  assert.deepEqual(Object.fromEntries(rows.map(r => [r.key,r.hits])), { [`auth:forgot:ip:${ip}`]: 10, [`auth:reset-code:ip:${ip}`]: 1 });
}));

test('twenty reset-code requests do not consume forgot IP allowance', { skip }, () => fixture(async f => {
  const ip = '192.0.2.102';
  for (let i=0; i<20; i++) assert.equal((await f.request('reset-password', ip)).status, 400);
  assert.deepEqual(await f.request('forgot-password', ip), { status: 200, body: { ok:true } });
}));

test('eleventh forgot request is IP-limited with the unchanged body; another IP is unaffected', { skip }, () => fixture(async f => {
  for (let i=0; i<10; i++) assert.equal((await f.request('forgot-password', '192.0.2.103')).status, 200);
  assert.deepEqual(await f.request('forgot-password', '192.0.2.103'), { status: 429, body: limited });
  assert.deepEqual(await f.request('forgot-password', '192.0.2.104'), { status: 200, body: { ok:true } });
  await f.drain(); assert.equal(f.emails.length, 3); // Per-address cap still silently applies.
}));

test('twenty-first reset submission is IP-limited with the unchanged body', { skip }, () => fixture(async f => {
  for (let i=0; i<20; i++) assert.equal((await f.request('reset-password', '192.0.2.105')).status, 400);
  assert.deepEqual(await f.request('reset-password', '192.0.2.105'), { status: 429, body: limited });
}));

test('one-IP recovery: five wrong codes burn it, resend delivers a fresh code and reset succeeds', { skip }, () => fixture(async f => {
  const ip = '192.0.2.106';
  assert.equal((await f.request('forgot-password', ip)).status, 200);
  await f.drain(); assert.equal(f.emails.length, 1);
  const code = f.emails[0].code, wrong = code === '000000' ? '999999' : '000000';
  for (let i=0; i<5; i++) {
    const res = await f.request('reset-password', ip, { code: wrong });
    assert.equal(res.status, 400); assert.equal(res.body.code, 'invalid_code');
  }
  const spent = await f.request('reset-password', ip, { code });
  assert.equal(spent.status, 400); assert.equal(spent.body.code, 'invalid_code');
  assert.equal((await pool.query('SELECT * FROM password_reset_token WHERE user_id=$1',[f.id])).rowCount, 0);
  assert.equal((await f.request('forgot-password', ip)).status, 200);
  await f.drain(); assert.equal(f.emails.length, 2);
  assert.deepEqual(await f.request('reset-password', ip, { code: f.emails[1].code }), { status: 200, body: { ok:true } });
}));
