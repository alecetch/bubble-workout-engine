import { dbAvailableOrSkip } from "./helpers/requireDb.js";
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';
import { createProgramDayActionHandlers, programDayActionsRouter } from '../src/routes/programDayActions.js';
import express from 'express';
after(() => pool.end());
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
async function fixture(t) {
  if (!await dbAvailableOrSkip(t, pool)) return;
  const user = (await pool.query('INSERT INTO app_user (subject_id) VALUES ($1) RETURNING id', [`substitution-${randomUUID()}`])).rows[0].id;
  t.after(async () => { await pool.query('DELETE FROM program WHERE user_id=$1', [user]); await pool.query('DELETE FROM app_user WHERE id=$1', [user]); });
  await pool.query("INSERT INTO client_profile (user_id, fitness_level_slug) VALUES ($1, 'intermediate')", [user]);
  const program = (await pool.query(`INSERT INTO program (user_id, program_title, program_summary, weeks_count, days_per_week,
    program_outline_json, start_date, start_weekday, preferred_days_sorted_json)
    VALUES ($1, 'Substitution test', '', 1, 1, '{}', current_date, 'Mon', '["Mon"]') RETURNING id`, [user])).rows[0].id;
  const week = (await pool.query('INSERT INTO program_week (program_id, week_number) VALUES ($1, 1) RETURNING id', [program])).rows[0].id;
  const day = (await pool.query(`INSERT INTO program_day (program_id, program_week_id, week_number, day_number, global_day_index,
    program_day_key, session_duration_mins, scheduled_date) VALUES ($1,$2,1,1,1,'w1d1',60,current_date) RETURNING id`, [program, week])).rows[0].id;
  for (const [i, exercise] of ['bb_bench_press', 'bb_back_squat'].entries()) {
    await pool.query(`INSERT INTO program_exercise (program_id, program_day_id, program_day_key, segment_key, segment_type,
      exercise_id, equipment_items_slugs_csv, order_in_day, block_order, order_in_block, purpose)
      VALUES ($1,$2,'w1d1','main','single',$3,'barbell',$4,1,$4,'main')`, [program,day,exercise,i+1]);
  }
  const req = { request_id: 'substitution-test', auth: { user_id: user }, params: { programId: program }, body: { availableEquipmentCodes: ['bodyweight'] },
    log: { error() {}, info(event) { if (process.env.SUBSTITUTION_BENCHMARK) console.log(JSON.stringify(event)); } } };
  return { user, program, day, req, async rows() { return (await pool.query('SELECT * FROM program_exercise WHERE program_id=$1 ORDER BY id', [program])).rows; } };
}
async function start(f, db = pool) { const res = response(); await createProgramDayActionHandlers(db).startEquipmentSubstitution(f.req,res); assert.equal(res.statusCode,202,JSON.stringify(res.body)); return res.body; }
async function poll(f, jobId, user = f.user) { const res=response(); await createProgramDayActionHandlers(pool).pollEquipmentSubstitution({ ...f.req, auth: { user_id:user }, params: { programId:f.program,jobId } },res); return res; }
function failingDb(code) { return { query: pool.query.bind(pool), async connect() { const client=await pool.connect(); let updates=0; return { release: () => client.release(), async query(sql,params) { if (sql.includes('UPDATE program_exercise') && ++updates===2) throw Object.assign(new Error('private SQL detail'), { code }); return client.query(sql,params); } }; } }; }
test('durable substitutions commit swaps and are readable by another handler', async t => {
  const f=await fixture(t); if(!f)return;
  const before=await f.rows(); const result=await start(f);
  assert.equal(result.status,'complete'); assert.equal(result.swappedCount,2); assert.deepEqual(result.warnings,[]);
  assert.ok((await f.rows()).every((r,i)=>r.exercise_id!==before[i].exercise_id));
  const read=await poll(f,result.jobId); assert.equal(read.statusCode,200);
  const { jobId, ...expected }=result; assert.deepEqual(read.body,expected);
});
for (const [code,expected] of [['XX000','internal_error'],['57014','timeout']]) test(`substitution rollback and safe ${expected} result`, async t => {
  const f=await fixture(t); if(!f)return; const before=await f.rows();
  const result=await start(f,failingDb(code)); assert.equal(result.status,'failed'); assert.match(result.error,/Nothing was changed/); assert.ok(!JSON.stringify(result).includes('private SQL'));
  assert.deepEqual(await f.rows(),before);
  const row=(await pool.query('SELECT * FROM equipment_substitution_job WHERE id=$1',[result.jobId])).rows[0]; assert.equal(row.status,'failed'); assert.equal(row.error_code,expected);
  assert.deepEqual((await poll(f,result.jobId)).body, { ok:true, status:'failed', swappedCount:0, warnings:[], unsubstitutedExerciseIds:[], error:result.error });
});
test('stale jobs fail durably; young running jobs remain running', async t => {
  const f=await fixture(t); if(!f)return;
  for (const [age,status] of [[3,'failed'],[1,'running']]) {
    const id=(await pool.query(`INSERT INTO equipment_substitution_job (program_id,user_id,status,created_at) VALUES ($1,$2,'running',now()-$3*interval '1 minute') RETURNING id`,[f.program,f.user,age])).rows[0].id;
    const read=await poll(f,id); assert.equal(read.body.status,status);
    if(status==='failed') { assert.equal(read.body.error,"This update didn't finish. Nothing was changed."); assert.equal((await pool.query('SELECT error_code FROM equipment_substitution_job WHERE id=$1',[id])).rows[0].error_code,'stale'); }
  }
});
test('concurrent substitutions serialize without double swaps or duplicates', async t => {
  const f=await fixture(t); if(!f)return;
  const results=await Promise.all([start(f),start(f)]); assert.deepEqual(results.map(r=>r.swappedCount).sort(),[0,2]);
  const rows=await f.rows(); assert.equal(new Set(rows.map(r=>r.exercise_id)).size,rows.length); assert.ok(rows.every(r=>r.original_exercise_id));
});
test('job ownership, unknown UUID and malformed UUID isolation', async t => {
  const f=await fixture(t); if(!f)return; const result=await start(f); const stranger=randomUUID();
  assert.equal((await poll(f,result.jobId,stranger)).statusCode,403);
  for(const id of [randomUUID(),'invalid']) assert.equal((await poll(f,id)).statusCode,404);
  const res=response(); await createProgramDayActionHandlers(pool).startEquipmentSubstitution({...f.req,auth:{user_id:stranger}},res); assert.equal(res.statusCode,403);
});
test('retention deletes 31-day jobs and preserves 29-day jobs', async t => {
  const f=await fixture(t); if(!f)return;
  const ids=[]; for(const age of [31,29]) ids.push((await pool.query(`INSERT INTO equipment_substitution_job (program_id,user_id,status,created_at) VALUES ($1,$2,'complete',now()-$3*interval '1 day') RETURNING id`,[f.program,f.user,age])).rows[0].id);
  await start(f); assert.equal((await poll(f,ids[0])).statusCode,404); assert.equal((await poll(f,ids[1])).body.status,'complete');
});
test('substitution routes reject missing authentication', async () => {
  const app=express(); app.use(programDayActionsRouter); const server=app.listen(0); await new Promise(resolve=>server.once('listening',resolve));
  try { for(const method of ['POST','GET']) { const res=await fetch(`http://127.0.0.1:${server.address().port}/programs/${randomUUID()}/equipment-substitution${method==='GET'?'/'+randomUUID():''}`,{method}); assert.equal(res.status,401); } }
  finally { await new Promise(resolve=>server.close(resolve)); }
});
test('maximum generator program substitution benchmark', { skip: !process.env.SUBSTITUTION_BENCHMARK }, async t => {
  const f=await fixture(t); if(!f)return;
  const { runPipeline }=await import('../engine/runPipeline.js');
  const { buildInputsFromProfile }=await import('../src/services/buildInputsFromProfile.js');
  const { parseEmitterRows }=await import('../src/services/importEmitterService.js');
  const catalogue=(await pool.query('SELECT * FROM exercise_catalogue WHERE is_archived=false ORDER BY exercise_id')).rows;
  const equipment=(await pool.query('SELECT exercise_slug FROM equipment_items')).rows.map(r=>r.exercise_slug);
  const inputs=buildInputsFromProfile({ fitnessLevel:'intermediate', equipmentItemCodes:equipment, preferredDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], minutesPerSession:90, goals:['hypertrophy'] },catalogue);
  const plan=parseEmitterRows((await runPipeline({ db:pool,userId:null,programType:'hypertrophy',inputs,request:{program_length:12} })).rows);
  assert.equal(plan.prg.weeks_count,12); assert.equal(plan.prg.days_per_week,7);
  await pool.query('DELETE FROM program_day WHERE program_id=$1',[f.program]);
  await pool.query('DELETE FROM program_week WHERE program_id=$1',[f.program]);
  await pool.query('UPDATE program SET weeks_count=12, days_per_week=7 WHERE id=$1',[f.program]);
  for(const week of plan.weeks) {
    const weekId=(await pool.query('INSERT INTO program_week(program_id,week_number) VALUES ($1,$2) RETURNING id',[f.program,week.week_number])).rows[0].id;
    for(const day of plan.days.filter(d=>d.week_number===week.week_number)) {
      const dayId=(await pool.query(`INSERT INTO program_day(program_id,program_week_id,week_number,day_number,global_day_index,program_day_key,session_duration_mins,scheduled_date)
        VALUES ($1,$2,$3,$4,$5,$6,90,current_date+$5::int) RETURNING id`,[f.program,weekId,day.week_number,day.day_number,day.global_day_index,day.program_day_key])).rows[0].id;
      for(const ex of plan.exs.filter(e=>e.program_day_key===day.program_day_key)) {
        const source=catalogue.find(e=>e.exercise_id===ex.exercise_id);
        await pool.query(`INSERT INTO program_exercise(program_id,program_day_id,program_day_key,segment_key,segment_type,exercise_id,equipment_items_slugs_csv,order_in_day,block_order,order_in_block,purpose)
          VALUES ($1,$2,$3,$4,'single',$5,$6,$7,$8,$9,$10)`,[f.program,dayId,day.program_day_key,ex.segment_key,ex.exercise_id,(source?.equipment_items_slugs??[]).join(','),ex.order_in_day,ex.block_order,ex.order_in_block,ex.purpose]);
      }
    }
  }
  f.req.body.availableEquipmentCodes=['dumbbells'];
  const result=await start(f); assert.ok(['complete','partial'].includes(result.status));
  console.log(JSON.stringify({ benchmark:'maximum-generator',weeks:12,days_per_week:7,exercise_count:(await f.rows()).length,swapped_count:result.swappedCount,warnings:result.warnings.length }));
});
test('migration exposes durable job columns, checks and cascading foreign keys', async t => {
  const f=await fixture(t); if(!f)return;
  const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='equipment_substitution_job'")).rows.map(r=>r.column_name);
  assert.deepEqual(columns.sort(),['id','program_id','user_id','status','swapped_count','warnings_json','error_code','created_at','finished_at'].sort());
  const foreign=(await pool.query("SELECT confdeltype FROM pg_constraint WHERE conrelid='equipment_substitution_job'::regclass AND contype='f'")).rows;
  assert.equal(foreign.length,2); assert.ok(foreign.every(r=>r.confdeltype==='c'));
  await assert.rejects(pool.query("INSERT INTO equipment_substitution_job (program_id,user_id,status) VALUES ($1,$2,'invalid')",[f.program,f.user]),{code:'23514'});
});

test('stopping the API during a request rolls back swaps and leaves a durable stale job', async t => {
  const f=await fixture(t); if(!f)return;
  const before=await f.rows();
  const { fork }=await import('node:child_process');
  const { once }=await import('node:events');
  const child=fork(new URL('./fixtures/equipmentSubstitutionCrashServer.js',import.meta.url),[],{env:{...process.env,CRASH_TEST_USER:f.user},stdio:['ignore','ignore','inherit','ipc']});
  const killTimer=setTimeout(()=>child.kill('SIGKILL'),20_000); killTimer.unref();
  t.after(()=>{ clearTimeout(killTimer); if(child.exitCode===null && !child.killed) child.kill('SIGKILL'); });
  const [ready]=await once(child,'message');
  const reached=once(child,'message');
  const request=fetch(`http://127.0.0.1:${ready.port}/programs/${f.program}/equipment-substitution`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(f.req.body)}).catch(()=>null);
  const [message]=await reached; assert.equal(message.event,'first_swap');
  const exited=once(child,'exit'); child.kill('SIGKILL'); await exited; await request;
  assert.deepEqual(await f.rows(),before);
  const job=(await pool.query('SELECT * FROM equipment_substitution_job WHERE program_id=$1',[f.program])).rows[0]; assert.equal(job.status,'running');
  await pool.query("UPDATE equipment_substitution_job SET created_at=now()-interval '3 minutes' WHERE id=$1",[job.id]);
  assert.equal((await poll(f,job.id)).body.status,'failed');
});
test('lost COMMIT acknowledgement returns the committed result', async t => {
  const f=await fixture(t); if(!f)return;
  const db={query:pool.query.bind(pool),async connect(){const client=await pool.connect();return {release:()=>client.release(),async query(sql,params){const result=await client.query(sql,params);if(sql==='COMMIT')throw new Error('lost acknowledgement');return result;}};}};
  const result=await start(f,db); assert.equal(result.status,'complete'); assert.equal(result.swappedCount,2);
  assert.equal((await poll(f,result.jobId)).body.status,'complete');
});
test('retention failure is logged and does not prevent substitution', async t => {
  const f=await fixture(t); if(!f)return; const logs=[]; f.req.log.error=event=>logs.push(event);
  const db={connect:pool.connect.bind(pool),query(sql,params){if(sql.startsWith('DELETE FROM equipment_substitution_job'))throw new Error('retention unavailable');return pool.query(sql,params);}};
  assert.equal((await start(f,db)).status,'complete'); assert.equal(logs[0].event,'equipment_substitution.retention_failed');
});
