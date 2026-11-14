import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../src/db.js";
import { createGenerateProgramV2Handler } from "../src/routes/generateProgramV2.js";
import { makeRequireAuth } from "../src/middleware/requireAuth.js";
import { makeRequireEntitlement } from "../src/middleware/requireEntitlement.js";
import { getYearProgress } from "../src/services/yearProgress.js";
const dbOptions = { skip: !process.env.PGPASSWORD && !process.env.DATABASE_URL ? "requires test database" : false };
const secret = "replace-program-test-secret-at-least-32-characters";
const issuer = "replace-program-tests";
const logs = [];
const log = { debug() {}, warn() {}, error() {}, info(value) { logs.push(value); } };
test.after(async () => { await pool.end(); });

async function user(t) {
  const row = (await pool.query("INSERT INTO app_user (subject_id, trial_expires_at) VALUES ($1, now() + interval '14 days') RETURNING id", [`replace-${randomUUID()}`])).rows[0];
  await pool.query(`INSERT INTO client_profile (user_id,fitness_level_slug,main_goals_slugs,equipment_items_slugs,injury_flags,preferred_days,minutes_per_session)
    VALUES ($1,'intermediate',ARRAY['strength'],ARRAY['barbell'],ARRAY[]::text[],ARRAY['mon'],60)`, [row.id]);
  t.after(async () => {
    await pool.query("DELETE FROM generation_run WHERE program_id IN (SELECT id FROM program WHERE user_id=$1)", [row.id]);
    await pool.query("DELETE FROM program WHERE user_id=$1", [row.id]);
    await pool.query("DELETE FROM app_user WHERE id=$1", [row.id]);
  });
  return row.id;
}
async function active(userId, type = "strength", primary = true) {
  return (await pool.query(`INSERT INTO program (user_id,program_title,program_summary,weeks_count,days_per_week,program_outline_json,start_date,start_weekday,preferred_days_sorted_json,status,is_ready,program_type,is_primary)
    VALUES ($1,'Old plan','History fixture',1,1,'{}',CURRENT_DATE,'mon','[]','active',true,$2,$3) RETURNING id`, [userId,type,primary])).rows[0].id;
}
async function day(programId, userId, number, offset, completed = false) {
  const week = (await pool.query(`INSERT INTO program_week (program_id,week_number) VALUES ($1,1) ON CONFLICT (program_id,week_number) DO UPDATE SET focus='' RETURNING id`, [programId])).rows[0].id;
  const id = (await pool.query(`INSERT INTO program_day (program_id,program_week_id,week_number,day_number,global_day_index,program_day_key,session_duration_mins,scheduled_date,is_completed)
    VALUES ($1,$2,1,$3,$3,$4,45,CURRENT_DATE+$5::int,$6) RETURNING id`, [programId,week,number,`day-${number}`,offset,completed])).rows[0].id;
  const calendar = (await pool.query(`INSERT INTO program_calendar_day (program_id,user_id,program_week_id,program_day_id,week_number,scheduled_offset_days,scheduled_weekday,scheduled_date,global_day_index,is_training_day,program_day_key)
    VALUES ($1,$2,$3,$4,1,$5,'mon',CURRENT_DATE+$5::int,$6,true,$7) RETURNING id`, [programId,userId,week,id,offset,number,`day-${number}`])).rows[0].id;
  return { id, calendar };
}
function app(options = {}) {
  const handler = createGenerateProgramV2Handler({
    db: options.db ?? pool,
    getAllowed: async () => [], buildInputs: () => ({}),
    pipeline: options.pipeline ?? (async () => ({ rows: [{ row_type: "PRG" }], program: { weeks: [] } })),
    emitPayload: async ({ payload }) => {
      await day(payload.program_id, payload.user_id, 1, 0);
      await day(payload.program_id, payload.user_id, 2, 2);
      const today = (await pool.query("SELECT CURRENT_DATE::text today")).rows[0].today;
      return { counts: { days: 2 }, idempotent: false, prg_data: { start_date: today, weeks_count: 1 } };
    },
    progressionService: { applyProgressionRecommendations: async () => {} },
    ...(options.ensureCalendar ? { ensureCalendar: options.ensureCalendar } : {}),
  });
  const result = express();
  result.use(express.json(), (req, _res, next) => { req.log = log; req.request_id = "replace-test"; next(); });
  result.post("/generate-plan-v2", makeRequireAuth(secret,issuer), makeRequireEntitlement(pool), handler);
  return result;
}
async function request(instance, userId, body = {}) {
  const server = instance.listen(0,"127.0.0.1");
  await new Promise(resolve => server.once("listening",resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/generate-plan-v2`, {
      method: "POST", headers: { "content-type": "application/json", ...(userId ? { authorization: `Bearer ${jwt.sign({ sub:userId, iss:issuer },secret,{ expiresIn:"1h" })}` } : {}) },
      body: JSON.stringify({ programType:"strength", ...body }),
    });
    return { status:response.status, body:await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
async function state(id) { return (await pool.query("SELECT status,is_primary FROM program WHERE id=$1",[id])).rows[0]; }

test("replacement archives atomically while preserving completed/past calendar rows, logs and year count", dbOptions, async t => {
  const uid = await user(t); const old = await active(uid);
  const past = await day(old,uid,1,-1,true);
  const today = await day(old,uid,2,0,true);
  const futureComplete = await day(old,uid,3,1,true);
  const future = await day(old,uid,4,2);
  const pastPending = await day(old,uid,5,-2);
  await pool.query("INSERT INTO segment_exercise_log (user_id,program_id,program_day_id,is_draft,reps_completed) VALUES ($1,$2,$3,false,10)",[uid,old,past.id]);
  await pool.query("INSERT INTO training_session (user_id,local_date,source,program_day_id) VALUES ($1,CURRENT_DATE,'program_day',$2)",[uid,today.id]);
  const before = await getYearProgress(pool,uid);
  const result = await request(app(),uid,{ replace_active_program:true });
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.deepEqual(result.body.replaced_program_ids,[old]);
  assert.deepEqual(await state(old),{status:"archived",is_primary:false});
  assert.deepEqual(await state(result.body.program_id),{status:"active",is_primary:true});
  const kept = (await pool.query("SELECT id FROM program_calendar_day WHERE program_id=$1",[old])).rows.map(row=>row.id).sort();
  assert.deepEqual(kept,[past.calendar,today.calendar,futureComplete.calendar,pastPending.calendar].sort());
  assert.equal((await pool.query("SELECT id FROM program_calendar_day WHERE id=$1",[future.calendar])).rowCount,0);
  assert.equal((await pool.query("SELECT id FROM program_day WHERE program_id=$1",[old])).rowCount,5);
  assert.equal((await pool.query("SELECT id FROM segment_exercise_log WHERE program_id=$1",[old])).rowCount,1);
  assert.equal((await getYearProgress(pool,uid)).count,before.count);
  assert.equal(before.count,1);
  const entry = logs.findLast(row=>row.event==="program.replaced");
  assert.deepEqual(entry,{event:"program.replaced",replaced_count:1,removed_future_days:1});
});
for (const flag of [undefined,false,"true",1]) test(`legacy/nonboolean replacement flag (${String(flag)}) retains same-type 409`,dbOptions,async t=>{
  const uid=await user(t);const old=await active(uid);
  const result=await request(app(),uid,{replace_active_program:flag});
  assert.equal(result.status,409);assert.equal(result.body.code,"conflict_active_program_same_type");
  assert.equal(result.body.error,"You already have an active strength program. Archive it before generating a new one.");
  assert.equal(result.body.details.active_program_type,"strength");
  assert.deepEqual(await state(old),{status:"active",is_primary:true});
});
test("goal switch replaces the primary and does not conflict with its dates",dbOptions,async t=>{
  const uid=await user(t);const old=await active(uid,"hypertrophy");await day(old,uid,1,2);
  const result=await request(app(),uid,{replace_active_program:true});
  assert.equal(result.status,200,JSON.stringify(result.body));assert.deepEqual(result.body.replaced_program_ids,[old]);
  assert.equal((await state(old)).status,"archived");
});
test("another active program still conflicts and archives nothing",dbOptions,async t=>{
  const uid=await user(t);const primary=await active(uid);const other=await active(uid,"conditioning",false);await day(other,uid,1,2);
  const result=await request(app(),uid,{replace_active_program:true});
  assert.equal(result.status,409,JSON.stringify(result.body));assert.equal(result.body.code,"schedule_conflict");
  assert.deepEqual(result.body.details.existing_program_types,["conditioning"]);
  assert.deepEqual(await state(primary),{status:"active",is_primary:true});assert.equal((await state(other)).status,"active");
});
test("pipeline failure leaves the old plan untouched",dbOptions,async t=>{
  const uid=await user(t);const old=await active(uid);const scheduled=await day(old,uid,1,2);
  const result=await request(app({pipeline:async()=>{throw new Error("injected pipeline failure");}}),uid,{replace_active_program:true});
  assert.equal(result.status,500);assert.deepEqual(await state(old),{status:"active",is_primary:true});
  assert.equal((await pool.query("SELECT id FROM program_calendar_day WHERE id=$1",[scheduled.calendar])).rowCount,1);
});
test("failure after activation rolls back archives and calendar deletion",dbOptions,async t=>{
  const uid=await user(t);const old=await active(uid);const scheduled=await day(old,uid,1,2);
  const result=await request(app({ensureCalendar:async()=>{throw new Error("injected post-activation failure");}}),uid,{replace_active_program:true});
  assert.equal(result.status,500);assert.deepEqual(await state(old),{status:"active",is_primary:true});
  assert.equal((await pool.query("SELECT id FROM program_calendar_day WHERE id=$1",[scheduled.calendar])).rowCount,1);
  assert.equal((await state(result.body.program_id)).status,"failed");
});
test("replacement is scoped to the JWT owner and ignores client program IDs",dbOptions,async t=>{
  const a=await user(t);const b=await user(t);const foreign=await active(b);
  const result=await request(app(),a,{replace_active_program:true,user_id:b,program_ids:[foreign]});
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.replaced_program_ids,undefined);
  assert.deepEqual(await state(foreign),{status:"active",is_primary:true});
});
test("generation still requires authentication",async()=>{
  assert.equal((await request(app(),null,{replace_active_program:true})).status,401);
});

test("replacement includes primary plus same-type secondary and preserves unrelated programs",dbOptions,async t=>{
  const uid=await user(t);const primary=await active(uid,"hypertrophy");const same=await active(uid,"strength",false);const other=await active(uid,"conditioning",false);
  await day(primary,uid,1,2);await day(same,uid,1,3);await day(other,uid,1,4);
  const result=await request(app(),uid,{replace_active_program:true});
  assert.equal(result.status,200,JSON.stringify(result.body));assert.deepEqual(result.body.replaced_program_ids.sort(),[primary,same].sort());
  assert.deepEqual(await state(other),{status:"active",is_primary:false});
});
test("racing replacements leave exactly one active primary and fail the loser cleanly",dbOptions,async t=>{
  const uid=await user(t);const old=await active(uid);await day(old,uid,1,2);
  let ready=0;let release;const barrier=new Promise(resolve=>{release=resolve;});
  const db={ connect:()=>pool.connect(), async query(sql,params) {
    const result=await pool.query(sql,params);
    if (sql.includes("AND (program_type = $3")) { if (++ready===2) release(); await barrier; }
    return result;
  } };
  const instance=app({db});
  const results=await Promise.all([request(instance,uid,{replace_active_program:true}),request(instance,uid,{replace_active_program:true})]);
  assert.equal(results.filter(result=>result.status===200).length,1,JSON.stringify(results));
  assert.ok(results.some(result=>[409,500].includes(result.status)));
  const activeRows=(await pool.query("SELECT id,is_primary FROM program WHERE user_id=$1 AND status='active'",[uid])).rows;
  assert.equal(activeRows.length,1);assert.equal(activeRows[0].is_primary,true);assert.notEqual(activeRows[0].id,old);
});
test("concurrent different-type generation cannot activate overlapping schedules",dbOptions,async t=>{
  const uid=await user(t);
  let ready=0;let release;const barrier=new Promise(resolve=>{release=resolve;});
  const instance=app({ pipeline:async()=>{if (++ready===2) release();await barrier;return {rows:[{row_type:"PRG"}],program:{weeks:[]}};} });
  const results=await Promise.all([request(instance,uid,{programType:"strength"}),request(instance,uid,{programType:"conditioning"})]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409],JSON.stringify(results));
  assert.equal(results.find(result=>result.status===409).body.code,"schedule_conflict");
  assert.equal((await pool.query("SELECT id FROM program WHERE user_id=$1 AND status='active'",[uid])).rowCount,1);
});
