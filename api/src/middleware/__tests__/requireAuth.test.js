import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { makeRequireAuth, invalidatePasswordChangedAt } from '../requireAuth.js';
const secret='require-auth-hardening-unit-test-secret', issuer='auth-tests';
function req(id,iat=Math.floor(Date.now()/1000)) { return {headers:{authorization:'Bearer '+jwt.sign({sub:id,iat,iss:issuer},secret,{expiresIn:3600})},log:{warn(){}}}; }
function res(){return {statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
for(const state of ['before','after','null','rounding'])test(`password timestamp: ${state}`,async()=>{
  const id=randomUUID(), now=Date.now(), request=req(id), response=res();let called=0;
  const auth=makeRequireAuth(secret,issuer,{getPasswordChangedAt:async()=>state==='null'?null:new Date(now+(state==='before'?5000:state==='rounding'?-500:-5000))});
  await auth(request,response,()=>called++);
  assert.equal(called,state==='before'?0:1);if(state==='before'){assert.equal(response.statusCode,401);assert.equal(response.body.code,'invalid_token');}
});
test('lookup failure fails open, logs safely, and is not cached',async()=>{
  const id=randomUUID(), logs=[];let calls=0,passed=0;
  const auth=makeRequireAuth(secret,issuer,{getPasswordChangedAt:async()=>{calls++;throw Error('db private');}});
  for(let i=0;i<2;i++){const request=req(id);request.log.warn=x=>logs.push(x);await auth(request,res(),()=>passed++);}
  assert.equal(calls,2);assert.equal(passed,2);assert.deepEqual(logs,[{event:'auth.password_changed_at.lookup_failed'},{event:'auth.password_changed_at.lookup_failed'}]);
});
test('cache lasts 30 seconds and explicit invalidation forces a lookup',async t=>{
  const id=randomUUID();let calls=0,time=Date.now();t.mock.method(Date,'now',()=>time);
  const auth=makeRequireAuth(secret,issuer,{getPasswordChangedAt:async()=>{calls++;return null;}});
  const request=req(id);for(let i=0;i<2;i++)await auth(request,res(),()=>{});assert.equal(calls,1);
  invalidatePasswordChangedAt(id);await auth(request,res(),()=>{});assert.equal(calls,2);
  time+=30001;await auth(request,res(),()=>{});assert.equal(calls,3);
});
test('oldest cache entry is evicted at 10000 entries',async()=>{
  const id=randomUUID();let calls=0;const auth=makeRequireAuth(secret,issuer,{getPasswordChangedAt:async()=>{calls++;return null;}});
  await auth(req(id),res(),()=>{});
  // Use signed tokens because eviction must exercise the actual middleware.
  for(let i=0;i<10000;i++)await auth(req(randomUUID()),res(),()=>{});
  const before=calls;await auth(req(id),res(),()=>{});assert.equal(calls,before+1);
});
