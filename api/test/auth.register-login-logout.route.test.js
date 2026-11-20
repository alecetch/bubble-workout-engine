import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { pool } from '../src/db.js';
import { dbAvailableOrSkip } from './helpers/requireDb.js';
process.env.JWT_SECRET ??= 'auth-routes-hardening-test-secret-at-least-32';
process.env.JWT_ISSUER ??= 'auth-routes-hardening-tests';
const { authRouter } = await import('../src/routes/auth.js');
const { requireAuth } = await import('../src/middleware/requireAuth.js');
const { accountKeyForEmail, accountKeyForUser } = await import('../src/services/authThrottle.js');
after(() => pool.end());
const PASSWORD='Hardening-password-123!';
async function fixture(t, run) {
  if (!await dbAvailableOrSkip(t,pool)) return;
  const prefix=`auth-hardening-${randomUUID()}`;
  const ip=`198.18.${parseInt(prefix.slice(-4,-2),16)}.${parseInt(prefix.slice(-2),16)}`;
  const logs=[], emails=[], ids=new Set();
  const app=express();app.set('trust proxy',1);app.use(express.json());
  app.use((req,_res,next)=>{req.log=Object.fromEntries(['info','warn','debug','error'].map(level=>[level,(...args)=>logs.push({level,args})]));next();});
  app.use('/api/auth',authRouter);app.get('/protected',requireAuth,(req,res)=>res.json({user_id:req.auth.user_id}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  async function request(route,body,headers={}) {
    const response=await fetch(`http://127.0.0.1:${server.address().port}${route}`,{method:route==='/protected'?'GET':'POST',headers:{'content-type':'application/json','x-forwarded-for':ip,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  async function register(extra={}) {
    const email=`${prefix}-${emails.length}@example.test`;emails.push(email);
    const result=await request('/api/auth/register',{email,password:PASSWORD,...extra});
    if(result.body.user_id)ids.add(result.body.user_id);
    return {...result,email};
  }
  try {await run({request,register,logs,emails,ids});}
  finally {
    await new Promise(resolve=>server.close(resolve));
    await pool.query('DELETE FROM app_user WHERE email LIKE $1',[`${prefix}%`]);
    const keys=[`auth:cred:ip:${ip}`,...emails.map(accountKeyForEmail),...[...ids].map(accountKeyForUser)];
    await pool.query('DELETE FROM rate_limit_hit WHERE key=ANY($1::text[])',[keys]);
  }
}
function tokenShape(body) {
  assert.deepEqual(Object.keys(body).sort(),['ok','access_token','refresh_token','user_id','client_profile_id','subscription_status','trial_expires_at'].sort());
  for(const field of ['access_token','refresh_token','user_id','client_profile_id'])assert.equal(typeof body[field],'string');
  assert.equal(body.subscription_status,'trialing');assert.ok(body.trial_expires_at);
}
test('register returns its contract and a working access token without exposing passwords',t=>fixture(t,async f=>{
  const registered=await f.register();assert.equal(registered.status,201);tokenShape(registered.body);
  const protectedResult=await f.request('/protected',undefined,{authorization:`Bearer ${registered.body.access_token}`});
  assert.equal(protectedResult.status,200);assert.equal(protectedResult.body.user_id,registered.body.user_id);
  assert.ok(!JSON.stringify([registered.body,f.logs]).includes(PASSWORD));assert.ok(!Object.hasOwn(registered.body,'password'));
}));
test('register rejects existing email in the same or different case',t=>fixture(t,async f=>{
  const registered=await f.register();assert.equal(registered.status,201);
  for(const email of [registered.email,registered.email.toUpperCase()]) {
    const result=await f.request('/api/auth/register',{email,password:PASSWORD});assert.equal(result.status,409);assert.equal(result.body.code,'email_in_use');
    assert.ok(!JSON.stringify([result.body,f.logs]).includes(PASSWORD));
  }
}));
for(const [label,body] of [['missing email',{password:PASSWORD}],['invalid email',{email:'invalid',password:PASSWORD}],['missing password',{email:'validation@example.test'}],['short password',{email:'validation@example.test',password:'short'}]])test(`register validation: ${label}`,t=>fixture(t,async f=>{
  const result=await f.request('/api/auth/register',body);assert.equal(result.status,400);assert.equal(result.body.code,'validation_error');assert.ok(!JSON.stringify([result.body,f.logs]).includes(PASSWORD));
}));
test('register records a valid referral and accepts an unknown referral',t=>fixture(t,async f=>{
  const referrer=await f.register();const code=(await pool.query('SELECT referral_code FROM app_user WHERE id=$1',[referrer.body.user_id])).rows[0].referral_code;
  const referred=await f.register({referredByCode:code});assert.equal(referred.status,201);
  const row=(await pool.query('SELECT * FROM referral_conversion WHERE referred_user_id=$1',[referred.body.user_id])).rows[0];
  assert.equal(row.referrer_user_id,referrer.body.user_id);assert.equal(row.referred_code,code);
  const unknown=await f.register({referredByCode:`UNKNOWN-${randomUUID()}`});assert.equal(unknown.status,201);
  assert.equal((await pool.query('SELECT * FROM referral_conversion WHERE referred_user_id=$1',[unknown.body.user_id])).rowCount,0);
}));
test('login normalizes email case and spaces and returns the token contract',t=>fixture(t,async f=>{
  const registered=await f.register();
  const result=await f.request('/api/auth/login',{email:`  ${registered.email.toUpperCase()}  `,password:PASSWORD});
  assert.equal(result.status,200);tokenShape(result.body);assert.equal(result.body.user_id,registered.body.user_id);
}));
test('login gives identical 401 bodies for unknown accounts and wrong passwords',t=>fixture(t,async f=>{
  const registered=await f.register();const email=`${registered.email}.unknown`;f.emails.push(email);
  const wrong=await f.request('/api/auth/login',{email:registered.email,password:'Wrong-password-123'});
  const unknown=await f.request('/api/auth/login',{email,password:'Wrong-password-123'});
  assert.equal(wrong.status,401);assert.equal(unknown.status,401);assert.deepEqual(wrong.body,unknown.body);assert.equal(wrong.body.code,'invalid_credentials');
}));
for(const body of [{},{email:'missing-password@example.test'},{password:PASSWORD}])test(`login validates missing fields: ${Object.keys(body).join(',')||'all'}`,t=>fixture(t,async f=>{
  const result=await f.request('/api/auth/login',body);assert.equal(result.status,400);assert.equal(result.body.code,'validation_error');
}));
test('a deleted user cannot log in',t=>fixture(t,async f=>{
  const registered=await f.register();await pool.query('DELETE FROM app_user WHERE id=$1',[registered.body.user_id]);
  const result=await f.request('/api/auth/login',{email:registered.email,password:PASSWORD});assert.equal(result.status,401);assert.equal(result.body.code,'invalid_credentials');
}));
test('logout revokes the refresh token and is idempotent for missing or unknown credentials',t=>fixture(t,async f=>{
  const registered=await f.register();const token=registered.body.refresh_token;
  assert.equal((await f.request('/api/auth/logout',{refresh_token:token})).status,200);
  const refreshed=await f.request('/api/auth/refresh',{refresh_token:token});assert.equal(refreshed.status,401);assert.equal(refreshed.body.code,'invalid_token');
  for(const body of [undefined,{}, {refresh_token:''},{refresh_token:'unknown'}])assert.deepEqual(await f.request('/api/auth/logout',body),{status:200,body:{ok:true}});
}));
test('logout database failure returns 500 without token or SQL details',t=>fixture(t,async f=>{
  const original=pool.query;const token=`private-refresh-${randomUUID()}`;
  pool.query=function(sql,...args){if(sql.includes('DELETE FROM auth_refresh_token'))throw new Error(`private SQL ${token}\n at database.query`);return original.call(this,sql,...args);};
  try {
    const result=await f.request('/api/auth/logout',{refresh_token:token});assert.equal(result.status,500);assert.equal(result.body.code,'internal_error');
    assert.ok(!JSON.stringify([result.body,f.logs]).includes(token));assert.ok(!JSON.stringify(result.body).includes('database.query'));
  } finally {pool.query=original;}
}));
