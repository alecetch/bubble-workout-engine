import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { createGenerateProgramV2Handler } from "../src/routes/generateProgramV2.js";
const dbOptions={skip:!process.env.PGPASSWORD&&!process.env.DATABASE_URL?"requires test database":false};
test.after(async()=>{await pool.end();});
test("disabled physique rows cannot affect generation inputs; enabling restores context",dbOptions,async t=>{
  const previous=process.env.PHYSIQUE_ENABLED;delete process.env.PHYSIQUE_ENABLED;
  t.after(()=>{if(previous===undefined) delete process.env.PHYSIQUE_ENABLED;else process.env.PHYSIQUE_ENABLED=previous;});
  const profiles=new Map();const users=[];
  for(let i=0;i<2;i++) {
    const uid=(await pool.query("INSERT INTO app_user (subject_id) VALUES ($1) RETURNING id",[`physique-input-${randomUUID()}`])).rows[0].id;users.push(uid);
    const pid=(await pool.query("INSERT INTO client_profile (user_id) VALUES ($1) RETURNING id",[uid])).rows[0].id;
    profiles.set(uid,{id:pid,goals:["strength"],preferredDays:["Mon"],fitnessLevel:"intermediate",equipmentItemCodes:[],injuryFlags:[],minutesPerSession:45});
  }
  t.after(async()=>{for(const uid of users){await pool.query("DELETE FROM generation_run WHERE program_id IN (SELECT id FROM program WHERE user_id=$1)",[uid]);await pool.query("DELETE FROM program WHERE user_id=$1",[uid]);await pool.query("DELETE FROM app_user WHERE id=$1",[uid]);}});
  await pool.query(`INSERT INTO physique_scan (user_id,photo_s3_key,physique_score,emphasis_weights_json) VALUES ($1,'test-flag-scan',50,'{"chest":1.5}')`,[users[0]]);
  const inputs=[];let lookups=0;
  const db={connect:()=>pool.connect(),query:(sql,params)=>{if(/FROM physique_(scan|check_in)/.test(sql)) lookups++;return pool.query(sql,params);}};
  const handler=createGenerateProgramV2Handler({db,getProfileByUser:async uid=>profiles.get(uid),getAllowed:async()=>[],buildInputs:(_profile,_exercises,context)=>({physiqueContext:context}),pipeline:async ({inputs:value})=>{inputs.push(value);throw new Error("stop after observing inputs");}});
  for(const uid of users) await handler({auth:{user_id:uid},body:{programType:"strength"},log:{info(){},debug(){},warn(){},error(){}}},{status(){return this;},json(){return this;}});
  assert.deepEqual(inputs,[{physiqueContext:null,allowed_exercise_ids:[]},{physiqueContext:null,allowed_exercise_ids:[]}]);
  assert.equal(lookups,0);
  process.env.PHYSIQUE_ENABLED="true";
  await handler({auth:{user_id:users[0]},body:{programType:"strength"},log:{info(){},debug(){},warn(){},error(){}}},{status(){return this;},json(){return this;}});
  assert.equal(lookups,1);assert.deepEqual(inputs[2].physiqueContext.emphasisWeights,{chest:1.5});
});
