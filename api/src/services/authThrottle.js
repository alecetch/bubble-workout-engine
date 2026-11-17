import { createHash } from 'node:crypto';
import { pool } from '../db.js';
import { PgRateLimitStore } from '../middleware/pgRateLimitStore.js';
const emailHash = email => createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
export const accountKeyForUser = userId => `auth:pw-fail:${userId}`;
export const accountKeyForEmail = email => `auth:pw-fail:e:${emailHash(email)}`;
export const PASSWORD_THROTTLED = { ok: false, code: 'rate_limited', error: 'Too many attempts. Try again later.' };

export function makeAuthThrottle({ db = pool, now = Date.now, log } = {}) {
  const reset = new PgRateLimitStore({ db, now, prefix: 'auth:reset-req:', failMode: 'closed', log });
  reset.init({ windowMs: 3600000 });
  const password = new PgRateLimitStore({ db, now, prefix: '', failMode: 'open', log });
  password.init({ windowMs: 900000 });
  return {
    async noteResetRequest(email) { return { allowed: (await reset.increment(emailHash(email))).totalHits <= 3 }; },
    async checkPasswordAttempts(key) { return { allowed: (await password.get(key)).totalHits < 10 }; },
    async notePasswordFailure(key) { await password.increment(key); },
  };
}
const throttle = makeAuthThrottle();
export const noteResetRequest = (...args) => throttle.noteResetRequest(...args);
export const checkPasswordAttempts = (...args) => throttle.checkPasswordAttempts(...args);
export const notePasswordFailure = (...args) => throttle.notePasswordFailure(...args);
