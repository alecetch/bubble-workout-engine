import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../src/db.js";
import { makeRequireAuth } from "../src/middleware/requireAuth.js";
import { makeRequireEntitlement } from "../src/middleware/requireEntitlement.js";
import { makeRequirePremium } from "../src/middleware/requirePremium.js";
import { requirePhysiqueEnabled } from "../src/middleware/requirePhysiqueEnabled.js";
import { createPhysiqueReadRouter, createCheckInSubmitHandler, createTriggerAnalysisHandler, uploadSingle } from "../src/routes/physiqueCheckIn.js";
import { createScanSubmitHandler } from "../src/routes/physiqueScan.js";
const dbOptions = { skip: !process.env.PGPASSWORD && !process.env.DATABASE_URL ? "requires test database" : false };
let previous;
beforeEach(() => { previous=process.env.PHYSIQUE_ENABLED; delete process.env.PHYSIQUE_ENABLED; });
afterEach(() => { if (previous===undefined) delete process.env.PHYSIQUE_ENABLED; else process.env.PHYSIQUE_ENABLED=previous; });
test.after(async()=>{await pool.end();});
const secret="physique-feature-test-secret-at-least-32-characters";
const issuer="physique-feature-test";
async function user(t) {
  const uid=(await pool.query("INSERT INTO app_user (subject_id,subscription_status) VALUES ($1,'active') RETURNING id",[`physique-flag-${randomUUID()}`])).rows[0].id;
  t.after(()=>pool.query("DELETE FROM app_user WHERE id=$1",[uid]));
  return uid;
}
async function checkIn(uid) {
  return (await pool.query("INSERT INTO physique_check_in (user_id,photo_s3_key) VALUES ($1,'test-photo') RETURNING id",[uid])).rows[0].id;
}
function app(calls={storage:0,analysis:0,scan:0}) {
  const instance=express();instance.use(express.json());
  const auth=makeRequireAuth(secret,issuer);
  const analysis=async()=>{calls.analysis++;return {observations:[],emphasis_suggestions:[]};};
  instance.post("/api/physique/check-in",auth,requirePhysiqueEnabled,makeRequireEntitlement(pool),uploadSingle,createCheckInSubmitHandler({
    db:pool,putObjectFn:async()=>{calls.storage++;},deleteObjectFn:async()=>{},analysePhysiquePhotoFn:analysis,
  }));
  instance.post("/api/physique/check-ins/:id/analyse",auth,requirePhysiqueEnabled,makeRequireEntitlement(pool),createTriggerAnalysisHandler({
    db:pool,getPresignedUrlFn:async()=>"https://storage.example.test/photo",fetchFn:async()=>({ok:true,arrayBuffer:async()=>Buffer.from("photo")}),analysePhysiquePhotoFn:analysis,
  }));
  instance.post("/api/physique/scan",auth,requirePhysiqueEnabled,makeRequirePremium(pool),uploadSingle,createScanSubmitHandler({db:pool,runScan:async uid=>{
    calls.scan++;
    const row=(await pool.query("INSERT INTO physique_scan (user_id,photo_s3_key,physique_score) VALUES ($1,'test-scan',50) RETURNING id",[uid])).rows[0];
    return {ok:true,scan:row};
  }}));
  instance.use("/api",auth,createPhysiqueReadRouter({db:pool,deleteObjectFn:async()=>{},getPresignedUrlFn:async()=>"https://storage.example.test/photo"}));
  return instance;
}
async function request(instance,uid,path,{method="POST",photo=false,invalidPhoto=false}={}) {
  const server=instance.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
  try {
    const body=new FormData();body.append("photo",new Blob(["synthetic photo"],{type:invalidPhoto?"application/octet-stream":"image/jpeg"}),invalidPhoto?"bad.bin":"photo.jpg");body.append("skip_analysis","true");
    const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:uid?{authorization:`Bearer ${jwt.sign({sub:uid,iss:issuer},secret,{expiresIn:"1h"})}`}:{},...(photo?{body}:{})});
    return {status:response.status,body:await response.json()};
  } finally {await new Promise(resolve=>server.close(resolve));}
}
const paths=id=>["/api/physique/check-in",`/api/physique/check-ins/${id}/analyse`,"/api/physique/scan","/api/physique/consent"];
test("disabled writes return the exact 404 before parsing uploads or changing data",dbOptions,async t=>{
  const uid=await user(t);const id=await checkIn(uid);const calls={storage:0,analysis:0,scan:0};const instance=app(calls);
  for (const flag of [undefined,"false","TRUE"]) {
    if(flag===undefined) delete process.env.PHYSIQUE_ENABLED; else process.env.PHYSIQUE_ENABLED=flag;
    for(const path of paths(id)) {
      const result=await request(instance,uid,path,{photo:path.endsWith("check-in")||path.endsWith("scan"),invalidPhoto:true});
      assert.equal(result.status,404,path);
      assert.deepEqual(result.body,{ok:false,code:"feature_disabled",error:"Physique check-ins aren't available."});
    }
  }
  assert.deepEqual(calls,{storage:0,analysis:0,scan:0});
  assert.equal((await pool.query("SELECT id FROM physique_check_in WHERE user_id=$1",[uid])).rowCount,1);
  assert.equal((await pool.query("SELECT id FROM physique_scan WHERE user_id=$1",[uid])).rowCount,0);
  assert.equal((await pool.query("SELECT physique_consent_at FROM app_user WHERE id=$1",[uid])).rows[0].physique_consent_at,null);
});
test("auth runs before the disabled feature gate",async()=>{
  for(const path of paths(randomUUID())) assert.equal((await request(app(),null,path)).status,401,path);
});
test("existing check-ins can be listed and deleted only by their owner while disabled",dbOptions,async t=>{
  const a=await user(t);const b=await user(t);const own=await checkIn(a);const foreign=await checkIn(b);const instance=app();
  const listed=await request(instance,a,"/api/physique/check-ins",{method:"GET"});
  assert.equal(listed.status,200);assert.deepEqual(listed.body.check_ins.map(row=>row.id),[own]);
  assert.equal((await request(instance,a,`/api/physique/check-ins/${foreign}`,{method:"DELETE"})).status,404);
  assert.equal((await pool.query("SELECT id FROM physique_check_in WHERE id=$1",[foreign])).rowCount,1);
  assert.equal((await request(instance,a,`/api/physique/check-ins/${own}`,{method:"DELETE"})).status,200);
  assert.equal((await pool.query("SELECT id FROM physique_check_in WHERE id=$1",[own])).rowCount,0);
});
test("the same mounted routes resume existing behavior when enabled at request time",dbOptions,async t=>{
  const uid=await user(t);const calls={storage:0,analysis:0,scan:0};const instance=app(calls);
  process.env.PHYSIQUE_ENABLED="true";
  assert.equal((await request(instance,uid,"/api/physique/consent")).status,200);
  const created=await request(instance,uid,"/api/physique/check-in",{photo:true});assert.equal(created.status,201,JSON.stringify(created.body));
  assert.equal((await request(instance,uid,`/api/physique/check-ins/${created.body.check_in_id}/analyse`)).status,200);
  assert.equal((await request(instance,uid,"/api/physique/scan",{photo:true})).status,201);
  assert.deepEqual(calls,{storage:1,analysis:1,scan:1});
  delete process.env.PHYSIQUE_ENABLED;
  assert.equal((await request(instance,uid,"/api/physique/consent")).body.code,"feature_disabled");
});
test("server mounts each gate after auth and before multipart upload",()=>{
  const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
  assert.match(server,/userAuth, requirePhysiqueEnabled, requireEntitlement, uploadSingle, handleCheckInSubmit/);
  assert.match(server,/userAuth, requirePhysiqueEnabled, requireEntitlement, handleTriggerAnalysis/);
  assert.match(server,/userAuth, requirePhysiqueEnabled, requirePremium, uploadSingle, handleScanSubmit/);
});

test("authenticated users without entitlement also see feature_disabled while off",dbOptions,async t=>{
  const uid=await user(t);
  await pool.query("UPDATE app_user SET subscription_status='expired', trial_expires_at=now()-interval '1 day' WHERE id=$1",[uid]);
  for(const path of paths(randomUUID())) {
    const result=await request(app(),uid,path);
    assert.equal(result.status,404,path);assert.equal(result.body.code,"feature_disabled");
  }
});
