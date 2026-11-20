import { dbAvailableOrSkip } from "./helpers/requireDb.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { pool, log, withAuthUser } from '../testSupport/authHardeningFixtures.js';
process.env.JWT_SECRET ??= 'login-throttle-test-secret-at-least-32-characters';
process.env.JWT_ISSUER ??= 'login-throttle-tests';
const { authRouter } = await import('../src/routes/auth.js');
const { accountKeyForEmail } = await import('../src/services/authThrottle.js');
test.after(()=>pool.end());

test('password failures are shared across IPs for known and unknown accounts and expire by window',async (t)=>{
  if (!await dbAvailableOrSkip(t, pool)) return;
  return withAuthUser(async user=>withAuthUser(async other=>{
  const app=express();app.set('trust proxy',1);app.use(express.json());app.use((req,_res,next)=>{req.log=log;next();});app.use('/api/auth',authRouter);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const login=async(email,password,ip)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body:JSON.stringify({email,password})});return {status:res.status,body:await res.json()};};
  const unknown='absent-'+user.email;
  try {
    for(let i=1;i<=10;i++)assert.equal((await login(user.email,'wrong-password',`198.51.100.${i}`)).status,401);
    const blocked=await login(user.email,user.password,'198.51.100.11');assert.equal(blocked.status,429);assert.deepEqual(blocked.body,{ok:false,code:'rate_limited',error:'Too many attempts. Try again later.'});
    assert.equal((await login(other.email,other.password,'198.51.100.12')).status,200);
    await pool.query("UPDATE rate_limit_hit SET window_start=window_start-interval '1 day' WHERE key=$1",['auth:pw-fail:'+user.id]);
    assert.equal((await login(user.email,user.password,'198.51.100.13')).status,200);
    for(let i=1;i<=10;i++)assert.equal((await login(unknown,'wrong-password',`203.0.113.${i}`)).status,401);
    assert.equal((await login(unknown,'Valid-password-123','203.0.113.11')).status,429);
    assert.equal((await pool.query('SELECT hits FROM rate_limit_hit WHERE key=$1',[accountKeyForEmail(unknown)])).rows[0].hits,10);
    assert.ok(!JSON.stringify((await pool.query('SELECT key FROM rate_limit_hit')).rows).includes(unknown));
  } finally {await new Promise(resolve=>server.close(resolve));await pool.query('DELETE FROM rate_limit_hit WHERE key=$1',[accountKeyForEmail(unknown)]);}
}));
});
