import { pool } from '../db.js';
import logger from '../utils/logger.js';

export class PgRateLimitStore {
  localKeys = false;
  constructor({ db = pool, prefix, failMode = 'open', log = entry => logger.warn(entry), now = Date.now }) {
    this.db = db; this.prefix = prefix; this.failMode = failMode; this.log = log; this.now = now;
  }
  init({ windowMs }) { this.windowMs = windowMs; }
  window() {
    const start = Math.floor(Number(this.now()) / this.windowMs) * this.windowMs;
    return { start: new Date(start), end: new Date(start + this.windowMs) };
  }
  failure(end) {
    this.log?.({ event: 'rate_limit.store_error', fail_mode: this.failMode });
    return { totalHits: this.failMode === 'closed' ? Number.MAX_SAFE_INTEGER : 0, resetTime: end };
  }
  async increment(key) {
    const { start, end } = this.window();
    try {
      const { rows } = await this.db.query(`INSERT INTO rate_limit_hit(key,window_start,hits,expires_at) VALUES ($1,$2,1,$3)
        ON CONFLICT (key,window_start) DO UPDATE SET hits=rate_limit_hit.hits+1 RETURNING hits,expires_at`, [this.prefix + key, start, end]);
      return { totalHits: Number(rows[0].hits), resetTime: new Date(rows[0].expires_at) };
    } catch { return this.failure(end); }
  }
  async get(key) {
    const { start, end } = this.window();
    try {
      const { rows } = await this.db.query('SELECT hits,expires_at FROM rate_limit_hit WHERE key=$1 AND window_start=$2', [this.prefix + key, start]);
      return { totalHits: Number(rows[0]?.hits ?? 0), resetTime: rows[0] ? new Date(rows[0].expires_at) : end };
    } catch { return this.failure(end); }
  }
  async decrement(key) {
    try { await this.db.query('UPDATE rate_limit_hit SET hits=GREATEST(0,hits-1) WHERE key=$1 AND window_start=$2', [this.prefix + key, this.window().start]); }
    catch { this.failure(this.window().end); }
  }
  async resetKey(key) {
    try { await this.db.query('DELETE FROM rate_limit_hit WHERE key=$1', [this.prefix + key]); }
    catch { this.failure(this.window().end); }
  }
}

export function startRateLimitCleanup({ db = pool, intervalMs = 600000, log = entry => logger.warn(entry) } = {}) {
  let running = false, stopped = false;
  async function tick() {
    if (running || stopped) return;
    running = true;
    try { await db.query('DELETE FROM rate_limit_hit WHERE expires_at < now()'); }
    catch { log?.({ event: 'rate_limit.cleanup_error' }); }
    finally { running = false; }
  }
  const timer = setInterval(() => void tick(), intervalMs); timer.unref();
  return { stop() { stopped = true; clearInterval(timer); }, tick };
}
