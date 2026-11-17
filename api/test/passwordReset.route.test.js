import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { makeRequireAuth } from '../src/middleware/requireAuth.js';
import { pool, skip, log, response, withAuthUser } from '../testSupport/authHardeningFixtures.js';
process.env.JWT_SECRET ??= 'auth-hardening-test-secret-at-least-32-characters';
const { createForgotPasswordHandler, createResetPasswordHandler, createChangePasswordHandler } = await import('../src/routes/auth.js');
const { hashResetCode } = await import('../src/services/emailService.js');
test.after(()=>pool.end());

async function fixture(fn) {
  return withAuthUser(async user => {
    const queued=[],emails=[],notices=[];
    const schedule=fn=>queued.push(fn);
    const forgot=createForgotPasswordHandler({db:pool,schedule,sendReset:async args=>emails.push(args)});
    const reset=createResetPasswordHandler({db:pool,schedule,sendChanged:async args=>notices.push(args)});
    const drain=async()=>{while(queued.length)await queued.shift()();};
    const issue=async(email=user.email)=>{const res=response();await forgot({body:{email},log},res);assert.deepEqual(res.body,{ok:true});assert.equal(res.statusCode,200);await drain();return emails.at(-1)?.code;};
    const attempt=async code=>{const res=response();await reset({body:{email:user.email,code,new_password:'Changed-password-123'},log},res);return res;};
    const rows=async()=> (await pool.query('SELECT * FROM password_reset_token WHERE user_id=$1',[user.id])).rows;
    await fn({...user,forgot,reset,issue,attempt,rows,drain,queued,emails,notices,schedule});
  });
}

test('five wrong guesses burn the code; a fresh HMAC code works and clears tokens/codes', {skip},()=>fixture(async f=>{
  const code=await f.issue();const stored=(await f.rows())[0];
  assert.equal(stored.code_hash,hashResetCode(code));assert.notEqual(stored.code_hash,createHash('sha256').update(code).digest('hex'));
  for (let i=0;i<5;i++) {const res=await f.attempt(code==='000000'?'999999':'000000');assert.equal(res.statusCode,400);assert.equal(res.body.code,'invalid_code');}
  assert.equal((await f.rows())[0].attempts,5);
  assert.equal((await f.attempt(code)).body.code,'invalid_code');assert.equal((await f.rows()).length,0);
  const fresh=await f.issue();
  await pool.query("INSERT INTO password_reset_token(user_id,code_hash,expires_at,used_at) VALUES ($1,'old',now()+interval '1 hour',now())",[f.id]);
  await pool.query("INSERT INTO auth_refresh_token(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[f.id,'refresh-'+f.id]);
  assert.equal((await f.attempt(fresh)).statusCode,200);
  assert.equal(f.notices.length,0);await f.drain();assert.equal(f.notices.length,1);
  assert.equal((await f.rows()).length,0);assert.equal((await pool.query('SELECT * FROM auth_refresh_token WHERE user_id=$1',[f.id])).rowCount,0);
  assert.ok((await pool.query('SELECT password_changed_at FROM app_user WHERE id=$1',[f.id])).rows[0].password_changed_at);
}));

test('concurrent guesses from ten forwarded IPs cannot exceed five attempts', {skip},()=>fixture(async f=>{
  const code=await f.issue();const app=express();app.set('trust proxy',1);app.use(express.json());app.use((req,_res,next)=>{req.log=log;next();});app.post('/reset',f.reset);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try {
    const results=await Promise.all(Array.from({length:10},async(_,i)=>{
      const r=await fetch(`http://127.0.0.1:${server.address().port}/reset`,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`198.51.100.${i+1}`},body:JSON.stringify({email:f.email,code:code==='000000'?'999999':'000000',new_password:'New-password-123'})});
      const current=await f.rows();assert.ok(current.every(row=>row.attempts<=5));return {status:r.status,body:await r.json()};
    }));
    assert.ok(results.every(r=>r.status===400&&r.body.code==='invalid_code'));assert.equal((await f.attempt(code)).body.code,'invalid_code');assert.equal((await f.rows()).length,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('known/unknown responses are identical and finish before any background lookup/email; fourth request sends nothing', {skip},()=>fixture(async f=>{
  const known=response(),unknown=response();
  await f.forgot({body:{email:f.email.toUpperCase()},log},known);
  const absent='absent-'+f.email;
  await f.forgot({body:{email:absent},log},unknown);
  assert.deepEqual(known.body,unknown.body);assert.equal(known.statusCode,200);assert.equal(unknown.statusCode,200);assert.equal(f.emails.length,0);
  assert.equal(f.queued.length,2);await f.drain();assert.equal(f.emails.length,1);
  await f.issue();await f.issue();const count=f.emails.length;await f.issue();assert.equal(count,3);assert.equal(f.emails.length,3);
  await pool.query('DELETE FROM rate_limit_hit WHERE key=$1',['auth:reset-req:'+createHash('sha256').update(absent).digest('hex')]);
}));

test('background failures and closed reset throttle still return 200 without sensitive logs', async()=>{
  const logs=[],queue=[];
  const handler=createForgotPasswordHandler({db:{query:async()=>{throw Error('private');}},schedule:fn=>queue.push(fn),throttle:{noteResetRequest:async()=>({allowed:true})}});
  const res=response();await handler({body:{email:'private@example.test'},log:{error:x=>logs.push(x)}},res);await queue[0]();
  assert.deepEqual(res.body,{ok:true});assert.deepEqual(logs,[{event:'auth.forgot_password.async_error'}]);
  const closed=createForgotPasswordHandler({db:{query:async()=>{throw Error('private');}},schedule(){assert.fail('must not schedule');}});
  const result=response();await closed({body:{email:'private@example.test'},log},result);assert.deepEqual(result.body,{ok:true});
  const unexpected=createForgotPasswordHandler({throttle:{noteResetRequest:async()=>{throw Error('private');}},schedule(){assert.fail('must not schedule');}});
  const safe=response();await unexpected({body:{email:'private@example.test'},log},safe);assert.equal(safe.statusCode,200);assert.deepEqual(safe.body,{ok:true});
});

test('change-password throttles the eleventh check, then success invalidates codes and queues one notification', {skip},()=>fixture(async f=>{
  const handler=createChangePasswordHandler(pool,{schedule:f.schedule,sendChanged:async args=>f.notices.push(args)});
  const call=async currentPassword=>{const r=response();await handler({auth:{user_id:f.id},body:{currentPassword,newPassword:'Changed-password-123'},log},r);return r;};
  for(let i=0;i<10;i++)assert.equal((await call('incorrect-password')).statusCode,401);
  assert.equal((await call(f.password)).statusCode,429);
  await pool.query("UPDATE rate_limit_hit SET window_start=window_start-interval '1 day' WHERE key=$1",['auth:pw-fail:'+f.id]);
  await f.issue();assert.equal((await call(f.password)).statusCode,200);await f.drain();assert.equal(f.notices.length,1);assert.equal((await f.rows()).length,0);
  assert.ok((await pool.query('SELECT password_changed_at FROM app_user WHERE id=$1',[f.id])).rows[0].password_changed_at);
}));

test('successful reset invalidates this machine cache and rejects an older token immediately', {skip},()=>fixture(async f=>{
  const secret='reset-cache-integration-test-secret',issuer='reset-cache-test';
  const token=jwt.sign({sub:f.id,iat:Math.floor(Date.now()/1000)-60,iss:issuer},secret,{expiresIn:3600});
  const auth=makeRequireAuth(secret,issuer);let passed=0;
  const request=()=>({headers:{authorization:'Bearer '+token},log});
  await auth(request(),response(),()=>passed++);assert.equal(passed,1);
  assert.equal((await f.attempt(await f.issue())).statusCode,200);
  const after=response();await auth(request(),after,()=>passed++);assert.equal(passed,1);assert.equal(after.body.code,'invalid_token');await f.drain();
}));

test('reset rolls back hash/code changes if refresh-token revocation fails and queues no notice', {skip},()=>fixture(async f=>{
  const code=await f.issue();
  const before=(await pool.query('SELECT password_hash,password_changed_at FROM app_user WHERE id=$1',[f.id])).rows[0];
  const broken={async connect(){const client=await pool.connect();return {release:()=>client.release(),query(sql,args){if(sql.startsWith('DELETE FROM auth_refresh_token'))throw Error('simulated failure');return client.query(sql,args);}};}};
  const handler=createResetPasswordHandler({db:broken,schedule(){assert.fail('cannot notify an uncommitted change');}});
  const res=response();await handler({body:{email:f.email,code,new_password:'Changed-password-123'},log},res);assert.equal(res.statusCode,500);
  assert.deepEqual((await pool.query('SELECT password_hash,password_changed_at FROM app_user WHERE id=$1',[f.id])).rows[0],before);
  assert.equal((await f.rows()).length,1);assert.equal((await f.rows())[0].attempts,0);
}));

test('notification delivery failure cannot change a successful reset response', {skip},()=>fixture(async f=>{
  const code=await f.issue(),logs=[];
  const handler=createResetPasswordHandler({db:pool,schedule:f.schedule,sendChanged:async()=>{throw Error('private');}});
  const res=response();await handler({body:{email:f.email,code,new_password:'Changed-password-123'},log:{warn:x=>logs.push(x)}},res);
  assert.equal(res.statusCode,200);assert.deepEqual(res.body,{ok:true});assert.equal(logs.length,0);
  await f.drain();assert.deepEqual(logs,[{event:'auth.password_changed.notify_failed'}]);assert.equal((await f.rows()).length,0);
}));
