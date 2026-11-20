import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { MemoryStore } from 'express-rate-limit';
import { pool } from '../src/db.js';
import { mintRestoreToken, _resetForTest } from '../src/hyrox/restoreToken.js';
import { createHyroxSubmissionDraftHandler, createHyroxSubmissionDraftLimiter } from '../src/hyrox/hyroxSubmissionDraftController.js';
const originalSecret=process.env.JWT_SECRET;
const email='restore-private-email@example.test', name='Private Restore Athlete';
let id, unavailable;
before(async () => {
  process.env.JWT_SECRET='restore-integration-secret'; _resetForTest();
  try { await pool.query('SELECT 1'); } catch(err) { unavailable=err.code; return; }
  id=(await pool.query(`INSERT INTO hyrox_submissions (email,display_name,sex,age_on_race_day,age_group,division,
    finish_time_seconds,race_name,race_date,splits_json,roxzone_mode,athlete_context_json,performance_context_json,marketing_consent,calculator_mode)
    VALUES ($1,$2,'female',34,'30-34','open',5400,'HYROX London','2026-01-01','[]','none',
      '{"additionalContext":"private athlete context","targetFinishTimeSeconds":5000}', '{"private":"performance"}',true,'analyse') RETURNING id`,[email,name])).rows[0].id;
});
after(async () => {
  if(id) await pool.query('DELETE FROM hyrox_submissions WHERE id=$1',[id]);
  await pool.end();
  if(originalSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=originalSecret;
  _resetForTest();
});
async function withServer(app,fn) {
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve=>server.close(resolve)); }
}
function appFor({db=pool,logs=[],limiter}={}) {
  const app=express(); app.use((req,res,next)=>{ req.log={error(...args){logs.push(args);}};next(); });
  app.get('/api/hyrox/submission-draft/:submissionId',...(limiter?[limiter]:[]),createHyroxSubmissionDraftHandler(db));return app;
}
async function read({token,query='',submissionId=id,db=pool,logs=[]}={}) {
  return withServer(appFor({db,logs}),async base=>{
    const res=await fetch(`${base}/api/hyrox/submission-draft/${submissionId}${query}`,{headers:token===undefined?{}:{'X-Restore-Token':token}});
    return {status:res.status,body:await res.json(),headers:res.headers};
  });
}
function raceOnly(body) {
  assert.equal(body.restoredScope,'race_only');assert.equal(body.analysisSummary,null);
  assert.deepEqual(Object.keys(body.draft).sort(),['calculatorMode','race','splits','penalties','raceReplay','roxzoneTimeSeconds'].sort());
  assert.equal(body.draft.race.finishTimeSeconds,5400);
  for(const privateValue of [email,name,'private athlete context','performance','marketingConsent','athleteContext','athlete'])assert.ok(!JSON.stringify(body).includes(privateValue));
}
test('valid header restores personal details but never consent',async t=>{
  if(unavailable){t.skip(unavailable);return;}
  const logs=[];const token=mintRestoreToken(id);const res=await read({token,logs});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('vary'),'X-Restore-Token');assert.equal(res.body.restoredScope,'full');
  assert.equal(res.body.draft.athlete.email,email);assert.equal(res.body.draft.athlete.name,name);assert.equal(res.body.draft.athlete.gender,'female');
  assert.equal(res.body.draft.athleteContext.additionalContext,'private athlete context');assert.ok(!JSON.stringify(res.body).includes('marketingConsent'));assert.deepEqual(logs,[]);
});
for(const mode of ['none','expired','another','tampered','v2','empty','query-token','query-rt'])test(`race-only restore for ${mode}`,async t=>{
  if(unavailable){t.skip(unavailable);return;}
  const valid=mintRestoreToken(id);let token,query='';
  if(mode==='expired')token=mintRestoreToken(id,{now:Date.now()-31*86400000});
  if(mode==='another')token=mintRestoreToken(randomUUID());
  if(mode==='tampered')token=valid.slice(0,-2)+(valid.at(-2)==='A'?'B':'A')+valid.at(-1);
  if(mode==='v2')token=valid.replace('v1.','v2.');if(mode==='empty')token='';
  if(mode.startsWith('query-'))query=`?${mode.slice(6)}=${encodeURIComponent(valid)}`;
  const logs=[],queries=[];const db={query(sql,params){queries.push(sql);return pool.query(sql,params);}};
  const res=await read({token,query,logs,db});assert.equal(res.status,200);raceOnly(res.body);assert.deepEqual(logs,[]);
  assert.ok(!queries[0].match(/s\.(email|display_name|sex|age_on_race_day|age_group|athlete_context_json|performance_context_json|marketing_consent)|analysis_json/));
});
test('invalid and unknown IDs retain their status codes',async t=>{
  if(unavailable){t.skip(unavailable);return;}
  assert.equal((await read({submissionId:'invalid'})).status,400);assert.equal((await read({submissionId:randomUUID()})).status,404);
});
test('database errors log only a safe message, never credentials or athlete data',async()=>{
  const logs=[];const token=mintRestoreToken(id??randomUUID());const res=await read({submissionId:id??randomUUID(),token,logs,db:{async query(){throw new Error('database unavailable');}}});
  assert.equal(res.status,500);assert.deepEqual(res.body,{error:'restore_failed'});
  const text=JSON.stringify(logs);assert.ok(text.includes('database unavailable'));for(const value of [token,email,name])assert.ok(!text.includes(value));
});
test('31st request from the same IP is limited with the configured shared-store options',async()=>{
  let options;const limiter=createHyroxSubmissionDraftLimiter({storeFactory(value){options=value;return new MemoryStore();}});
  assert.deepEqual(options,{prefix:'hyrox:draft:ip:',failMode:'open'});
  await withServer(appFor({limiter,db:{async query(){return {rows:[]};}}}),async base=>{
    for(let i=1;i<=31;i++){
      const res=await fetch(`${base}/api/hyrox/submission-draft/${randomUUID()}`);
      assert.equal(res.status,i===31?429:404);
      if(i===31){assert.deepEqual(await res.json(),{error:'too_many_requests'});assert.ok(res.headers.get('ratelimit-limit'));}
    }
  });
});
