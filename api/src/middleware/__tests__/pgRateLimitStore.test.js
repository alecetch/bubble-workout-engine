import { dbAvailableOrSkip } from "../../../test/helpers/requireDb.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db.js';
import { PgRateLimitStore, startRateLimitCleanup } from '../pgRateLimitStore.js';
test.after(() => pool.end());

test('fixed windows and separate store instances share counts; get/decrement/reset work', async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;

  const prefix = `test:${randomUUID()}:`; let instant = 2000000000000;
  const create = () => { const s = new PgRateLimitStore({ db: pool, prefix, now: () => instant }); s.init({ windowMs: 1000 }); return s; };
  const first = create(), second = create();
  try {
    assert.equal((await first.increment('key')).totalHits, 1);
    assert.equal((await second.increment('key')).totalHits, 2);
    assert.equal((await first.get('key')).totalHits, 2);
    await second.decrement('key'); assert.equal((await first.get('key')).totalHits, 1);
    instant += 1000; assert.equal((await first.increment('key')).totalHits, 1);
    assert.equal(+(await first.get('key')).resetTime, instant + 1000);
    await first.resetKey('key'); assert.equal((await second.get('key')).totalHits, 0);
    await second.decrement('key'); assert.equal((await second.get('key')).totalHits, 0);
  } finally { await pool.query('DELETE FROM rate_limit_hit WHERE key LIKE $1', [prefix+'%']); }

});

test('concurrent upserts are atomic', async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;

  const store = new PgRateLimitStore({ db: pool, prefix: `test:${randomUUID()}:` }); store.init({ windowMs: 900000 });
  try { const results = await Promise.all(Array.from({length:20},()=>store.increment('one'))); assert.deepEqual(results.map(r=>r.totalHits).sort((a,b)=>a-b), Array.from({length:20},(_,i)=>i+1)); }
  finally { await store.resetKey('one'); }

});

test('cleanup removes expired rows but keeps live windows', async t => {
  if (!await dbAvailableOrSkip(t, pool)) return;

  const key = 'test:'+randomUUID();
  const cleanup = startRateLimitCleanup({ db: pool }); t.after(cleanup.stop);
  try {
    await pool.query("INSERT INTO rate_limit_hit VALUES ($1,now()-interval '1 hour',1,now()-interval '1 second'),($1,now(),1,now()+interval '1 hour')", [key]);
    await cleanup.tick(); assert.equal((await pool.query('SELECT * FROM rate_limit_hit WHERE key=$1', [key])).rowCount,1);
  } finally { await pool.query('DELETE FROM rate_limit_hit WHERE key=$1', [key]); }

});

for (const mode of ['open','closed']) test(`database errors fail ${mode} without key/error details`, async () => {
  const logs=[]; const store = new PgRateLimitStore({ prefix:'test:',failMode:mode,db:{query:async()=>{throw Error('sensitive');}},log:x=>logs.push(x) }); store.init({windowMs:1000});
  for(const result of [await store.increment('private'),await store.get('private')]) assert.equal(result.totalHits,mode==='open'?0:Number.MAX_SAFE_INTEGER);
  await store.decrement('private'); await store.resetKey('private');
  assert.ok(logs.length >= 2); assert.ok(logs.every(l=>l.event==='rate_limit.store_error')); assert.ok(!JSON.stringify(logs).includes('sensitive'));
});
